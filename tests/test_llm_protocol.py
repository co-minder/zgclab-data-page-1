"""Protocol regressions for the fixed-model keyless relay, without live tokens."""
from __future__ import annotations

import io
import json
import unittest
import urllib.error
from unittest.mock import patch

from service.llm import LLMClient, ModelUnavailable, NoRedirect, json_object

MODEL = 'auto/deepseek-v4.1-flash'
USAGE = {'prompt_tokens': 6888, 'completion_tokens': 3400, 'total_tokens': 10288}
SECRET = 'synthetic-secret-never-forward'


class Response:
    def __init__(self, body, chunk_size=65536):
        self.body = io.BytesIO(body)
        self.chunk_size = chunk_size

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.body.close()

    def read1(self, size):
        return self.body.read(min(size, self.chunk_size))


class Opener:
    def __init__(self, payload=None, error=None):
        self.payload, self.error, self.calls = payload, error, []

    def open(self, request, timeout):
        self.calls.append((request, timeout))
        if self.error:
            raise self.error
        return Response(json.dumps(self.payload).encode())


def completion(content='{}', finish='stop', **message):
    return {'model': 'deepseek-v4.1-flash',
            'choices': [{'message': {'role': 'assistant', 'content': content, **message},
                         'finish_reason': finish}], 'usage': dict(USAGE)}


class LLMProtocol(unittest.TestCase):
    def client(self, result=None, error=None, timeout=55):
        client = LLMClient('http://127.0.0.1:13426/v1', MODEL, timeout=timeout)
        client.opener = Opener(result, error)
        return client

    def reject(self, result, reason):
        client = self.client(result)
        with self.assertRaises(ModelUnavailable) as raised:
            client.complete([{'role': 'user', 'content': 'evidence'}], 3400)
        self.assertEqual(raised.exception.reason, reason)
        self.assertEqual(len(client.opener.calls), 1, 'A rejected reply must not trigger a hidden retry')
        self.assertTrue(client.semaphore.acquire(blocking=False))
        self.assertTrue(client.semaphore.acquire(blocking=False))
        client.semaphore.release()
        client.semaphore.release()
        return raised.exception

    def test_request_reserves_output_for_final_content_on_the_fixed_model(self):
        messages = [{'role': 'system', 'content': 'Answer JSON with exact evidence quotes.'},
                    {'role': 'user', 'content': '中国相关资料'}]
        client = self.client(completion())
        self.assertEqual(client.complete(messages, 3400, timeout=20), ('{}', USAGE))
        request, timeout = client.opener.calls[0]
        payload = json.loads(request.data)
        self.assertEqual(payload['thinking'], {'type': 'disabled'})
        self.assertEqual(payload['model'], MODEL)
        self.assertEqual(payload['messages'], messages)
        self.assertEqual(payload['max_tokens'], 3400)
        self.assertFalse(payload['stream'])
        self.assertNotIn('reasoning_effort', payload, 'The gateway does not advertise a none effort')
        self.assertEqual(timeout, 20)
        self.assertEqual(request.full_url, 'http://127.0.0.1:13426/v1/chat/completions')
        self.assertFalse(any(key.lower() == 'authorization' for key, _ in request.header_items()))

    def test_maximum_output_and_deadline_remain_bounded(self):
        client = self.client(completion(), timeout=55)
        client.complete([], 100000, timeout=95)
        request, timeout = client.opener.calls[0]
        self.assertEqual(json.loads(request.data)['max_tokens'], 4096)
        self.assertEqual(timeout, 55)
        for budget in (0, -1):
            with self.subTest(budget=budget):
                client = self.client(completion())
                with self.assertRaisesRegex(ModelUnavailable, 'model_timeout'):
                    client.complete([], 3400, timeout=budget)
                self.assertEqual(client.opener.calls, [])

    def test_reasoning_only_length_stop_is_truncation_with_safe_usage(self):
        result = completion(None, 'length', reasoning_content=SECRET)
        result['usage']['completion_tokens_details'] = {'reasoning_tokens': 3400, 'private': SECRET}
        error = self.reject(result, 'model_output_truncated')
        self.assertEqual(error.usage, USAGE)
        self.assertEqual(error.diagnostics['reasoning_tokens'], 3400)
        self.assertEqual(error.diagnostics['content_type'], 'NoneType')
        self.assertEqual(error.diagnostics['reasoning_content_length'], len(SECRET))
        self.assertNotIn(SECRET, str(error) + json.dumps(vars(error)))

    def test_partial_or_parseable_content_stopped_at_length_is_never_accepted(self):
        for text in ('{"claims":[{', '{"claims":[]}'):
            with self.subTest(text=text):
                self.reject(completion(text, 'length', reasoning_content=SECRET), 'model_output_truncated')

    def test_reasoning_never_substitutes_for_final_content(self):
        for value in (None, '', '  ', [], [{'type': 'text', 'text': '{}'}], 12):
            with self.subTest(value=value):
                self.reject(completion(value, reasoning_content='{"claims":[]}'), 'invalid_model_response')
        result = completion(reasoning_content='{"claims":[]}')
        del result['choices'][0]['message']['content']
        self.reject(result, 'invalid_model_response')

    def test_valid_final_content_ignores_the_reasoning_channel(self):
        client = self.client(completion('{"claims":[]}', reasoning_content=SECRET))
        text, usage = client.complete([], 3400)
        self.assertEqual(json_object(text), {'claims': []})
        self.assertEqual(usage, USAGE)
        self.assertNotIn(SECRET, text + json.dumps(usage))

    def test_malformed_envelopes_do_not_raise_uncontrolled_errors(self):
        cases = [None, [], {'model': MODEL}, {'model': MODEL, 'choices': []},
                 {'model': MODEL, 'choices': {'0': {'message': {'content': '{}'}}}},
                 {'model': MODEL, 'choices': [None]},
                 {'model': MODEL, 'choices': [{'message': []}]},
                 {'model': MODEL, 'choices': [{'message': {'content': '{}'}}, {'message': {'content': '{}'}}]}]
        for result in cases:
            with self.subTest(result=result):
                self.reject(result, 'invalid_model_response')

    def test_model_identity_cannot_be_changed_or_malformed(self):
        for model in ('different-model', 'auto', '', None, [], {'model': MODEL}):
            with self.subTest(model=model):
                result = completion()
                result['model'] = model
                self.reject(result, 'model_mismatch')
        for model in (MODEL, 'deepseek-v4.1-flash'):
            result = completion()
            result['model'] = model
            self.assertEqual(self.client(result).complete([], 20), ('{}', USAGE))

    def test_only_assistant_final_messages_are_supported(self):
        for update in ({'role': 'user'}, {'tool_calls': [{'id': SECRET}]},
                       {'function_call': {'arguments': SECRET}}, {'refusal': SECRET}):
            with self.subTest(update=update):
                self.reject(completion(**update), 'invalid_model_response')
        for finish in ('tool_calls', 'content_filter', SECRET, {'private': SECRET}):
            with self.subTest(finish=finish):
                error = self.reject(completion(finish=finish), 'invalid_model_response')
                self.assertNotIn(SECRET, json.dumps(vars(error)))

    def test_usage_allowlist_rejects_private_or_noninteger_values(self):
        result = completion()
        result['usage'] = {'prompt_tokens': True, 'completion_tokens': -1, 'total_tokens': 2.5,
                           'credentials': SECRET, 'completion_tokens_details': {'reasoning_tokens': True}}
        self.assertEqual(self.client(result).complete([], 10)[1], {})
        result['usage'] = {'prompt_tokens': 0, 'completion_tokens': 1, 'total_tokens': 1, 'private': SECRET}
        self.assertEqual(self.client(result).complete([], 10)[1], {'prompt_tokens': 0, 'completion_tokens': 1, 'total_tokens': 1})

    def test_transport_timeouts_and_errors_never_include_urls_or_credentials(self):
        cases = [(TimeoutError(SECRET), 'model_timeout'),
                 (urllib.error.URLError(TimeoutError(SECRET)), 'model_timeout'),
                 (OSError(SECRET), 'model_unreachable'),
                 (urllib.error.HTTPError('https://private.invalid/' + SECRET, 500, SECRET, {}, io.BytesIO(SECRET.encode())), 'model_unreachable')]
        for remote, reason in cases:
            with self.subTest(error=type(remote).__name__):
                client = self.client(error=remote)
                with self.assertRaises(ModelUnavailable) as raised:
                    client.complete([], 10)
                self.assertEqual(str(raised.exception), reason)
                self.assertEqual(raised.exception.usage, {})
                self.assertEqual(raised.exception.diagnostics, {})
                self.assertNotIn(SECRET, repr(raised.exception))

    def test_body_read_cannot_renew_total_deadline_or_exceed_size_cap(self):
        with patch('service.llm.time.monotonic', side_effect=[10.1, 11.1]):
            with self.assertRaisesRegex(ModelUnavailable, 'model_timeout'):
                LLMClient.bounded_response(Response(b'abc', chunk_size=1), 8, 11)
        with self.assertRaisesRegex(ModelUnavailable, 'model_response_too_large'):
            LLMClient.bounded_response(Response(b'abc'), 2, float('inf'))

    def test_configuration_and_redirect_security_are_preserved(self):
        for base in ('https://127.0.0.1:13426/v1', 'http://remote.invalid:13426/v1',
                     'http://name:' + SECRET + '@127.0.0.1:13426/v1',
                     'http://127.0.0.1:13426/v1?private=' + SECRET,
                     'http://127.0.0.1:13426/v1#fragment', 'http://127.0.0.1:bad/v1'):
            with self.subTest(base=base):
                client = LLMClient(base, MODEL)
                client.opener = Opener(completion())
                with self.assertRaisesRegex(ModelUnavailable, 'configuration_unavailable'):
                    client.complete([], 10)
                self.assertEqual(client.opener.calls, [])
        client = LLMClient('http://127.0.0.1:13426/v1', 'other-model')
        self.assertFalse(client.configured)
        self.assertIsNone(NoRedirect().redirect_request(None, None, 302, '', {}, 'http://remote.invalid'))


if __name__ == '__main__':
    unittest.main()
