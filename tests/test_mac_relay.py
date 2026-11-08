"""Exercise the project's actual relay handler in memory; no sockets/model calls."""
from __future__ import annotations

import importlib.util
import io
import json
import threading
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

RELAY_PATH = Path(__file__).resolve().parents[1] / 'scripts' / 'mac_research_relay.py'
SPEC = importlib.util.spec_from_file_location('zgclab_mac_relay_contract_test', RELAY_PATH)
relay = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(relay)
MODEL = 'auto/deepseek-v4.1-flash'
SYNTHETIC_SECRET = 'test-only-private-field-must-not-be-forwarded'
MISSING = object()


class MacRelayContract(unittest.TestCase):
    def setUp(self):
        # Fail immediately if a future handler change tries to bypass urlopen's
        # mock. No HTTP server or socket is created by this test harness.
        self.network_guard = patch('socket.create_connection', side_effect=AssertionError('Network access forbidden in relay unit tests'))
        self.network_guard.start()
        self.addCleanup(self.network_guard.stop)
        self.bound = patch.object(relay, 'BOUND', threading.BoundedSemaphore(2))
        self.bound.start()
        self.addCleanup(self.bound.stop)

    def source(self, thinking=MISSING):
        source = {'model': MODEL, 'messages': [{'role': 'user', 'content': '中国相关资料'}], 'max_tokens': 3400}
        if thinking is not MISSING:
            source['thinking'] = thinking
        return source

    def invoke(self, source, *, path='/v1/chat/completions', error=None, length=None):
        body = json.dumps(source, ensure_ascii=False).encode()
        # Construct only the handler state do_POST consumes; do not invoke
        # BaseHTTPRequestHandler.__init__, which expects a real connection.
        handler = relay.Handler.__new__(relay.Handler)
        handler.path = path
        handler.headers = {'Content-Length': str(len(body) if length is None else length),
                           'Authorization': 'Bearer ' + SYNTHETIC_SECRET}
        handler.rfile = io.BytesIO(body)
        replies = []
        handler.reply = lambda status, value: replies.append((status, value))
        upstream = {'model': 'deepseek-v4.1-flash', 'choices': [{'message': {'role': 'assistant', 'content': '{}'}, 'finish_reason': 'stop'}]}
        with patch.object(relay, 'urlopen', return_value=io.BytesIO(json.dumps(upstream).encode()), side_effect=error) as mocked:
            handler.do_POST()
        self.assertEqual(len(replies), 1)
        return replies[0], mocked

    def forwarded(self, source):
        reply, mocked = self.invoke(source)
        self.assertEqual(reply[0], 200)
        self.assertEqual(mocked.call_count, 1)
        request = mocked.call_args.args[0]
        self.assertEqual(request.full_url, 'http://127.0.0.1:3425/v1/chat/completions')
        self.assertEqual(request.get_method(), 'POST')
        self.assertEqual(mocked.call_args.kwargs, {'timeout': 100})
        self.assertEqual(request.get_header('Authorization'), 'Bearer magpie')
        return json.loads(request.data)

    def test_only_exact_disabled_thinking_is_forwarded(self):
        source = self.source({'type': 'disabled'})
        source['response_format'] = {'type': 'json_object'}
        payload = self.forwarded(source)
        self.assertEqual(payload, {'model': MODEL, 'messages': source['messages'], 'stream': False,
                                   'max_tokens': 3400, 'thinking': {'type': 'disabled'},
                                   'response_format': {'type': 'json_object'}})

    def test_enabled_and_arbitrary_thinking_are_not_forwarded(self):
        for thinking in (MISSING, None, {}, {'type': 'enabled'}, {'type': 'adaptive'},
                         {'type': 'disabled', 'budget_tokens': 0},
                         {'type': 'disabled', 'private': SYNTHETIC_SECRET},
                         {'type': 'Disabled'}, {'type': {'value': 'disabled'}},
                         'disabled', ['disabled'], True, 0):
            with self.subTest(thinking_type=type(thinking).__name__, thinking=thinking if thinking is not MISSING else 'absent'):
                payload = self.forwarded(self.source(thinking))
                self.assertNotIn('thinking', payload)
                self.assertEqual(set(payload), {'model', 'messages', 'stream', 'max_tokens'})

    def test_request_allowlist_blocks_injected_route_credentials_and_message_fields(self):
        source = self.source({'type': 'disabled'})
        source.update(base_url='https://private.invalid/' + SYNTHETIC_SECRET, api_key=SYNTHETIC_SECRET,
                      headers={'Authorization': SYNTHETIC_SECRET}, reasoning_effort='max',
                      tools=[{'private': SYNTHETIC_SECRET}], stream=True, max_tokens=100000,
                      response_format={'type': 'json_schema', 'private': SYNTHETIC_SECRET})
        source['messages'] = [{'role': 'user', 'content': '中国相关资料',
                               'reasoning_content': SYNTHETIC_SECRET, 'tool_calls': [{'private': SYNTHETIC_SECRET}]}]
        payload = self.forwarded(source)
        self.assertEqual(payload, {'model': MODEL, 'messages': [{'role': 'user', 'content': '中国相关资料'}],
                                   'stream': False, 'max_tokens': 4096, 'thinking': {'type': 'disabled'}})
        self.assertNotIn(SYNTHETIC_SECRET, json.dumps(payload))

    def test_invalid_model_messages_paths_and_sizes_never_reach_upstream(self):
        for changes in ({'model': 'other-model'}, {'model': 'auto'}, {'messages': []},
                        {'messages': [{'role': 'tool', 'content': 'x'}]},
                        {'messages': [{'role': 'user', 'content': {'private': SYNTHETIC_SECRET}}]}):
            with self.subTest(changes=changes):
                source = self.source({'type': 'disabled'})
                source.update(changes)
                (status, _), mocked = self.invoke(source)
                self.assertEqual(status, 400)
                mocked.assert_not_called()
        (status, _), mocked = self.invoke(self.source(), path='/v1/other')
        self.assertEqual(status, 404)
        mocked.assert_not_called()
        for length in (0, 400001):
            (status, _), mocked = self.invoke(self.source(), length=length)
            self.assertEqual(status, 413)
            mocked.assert_not_called()

    def test_upstream_errors_keep_private_body_headers_and_url_out_of_reply(self):
        for error, expected in ((urllib.error.HTTPError('https://private.invalid/' + SYNTHETIC_SECRET, 500,
                                     SYNTHETIC_SECRET, {'Private': SYNTHETIC_SECRET}, io.BytesIO(SYNTHETIC_SECRET.encode())), 502),
                                (urllib.error.URLError(SYNTHETIC_SECRET), 503)):
            with self.subTest(error=type(error).__name__):
                (status, body), mocked = self.invoke(self.source({'type': 'disabled'}), error=error)
                self.assertEqual(status, expected)
                self.assertEqual(mocked.call_count, 1)
                self.assertNotIn(SYNTHETIC_SECRET, json.dumps(body))
                # Handler must release its semaphore even when urlopen fails.
                self.assertTrue(relay.BOUND.acquire(blocking=False))
                self.assertTrue(relay.BOUND.acquire(blocking=False))
                relay.BOUND.release()
                relay.BOUND.release()


if __name__ == '__main__':
    unittest.main()
