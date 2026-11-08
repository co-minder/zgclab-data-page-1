from __future__ import annotations

import collections
import threading
import time


class Limits:
    """Bounded, process-local sliding quotas; identifiers and credentials are never logged."""

    def __init__(self):
        self.lock = threading.Lock()
        self.events = collections.OrderedDict()

    def take(self, rules: list[tuple[str, int, int]]) -> tuple[bool, int]:
        now = time.monotonic()
        with self.lock:
            checked = []
            for key, maximum, window in rules:
                queue = self.events.setdefault(key, collections.deque())
                self.events.move_to_end(key)
                while queue and queue[0] <= now - window:
                    queue.popleft()
                if len(queue) >= maximum:
                    return False, max(1, int(window - (now - queue[0])) + 1)
                checked.append(queue)
            for queue in checked:
                queue.append(now)
            while len(self.events) > 8192:
                self.events.popitem(last=False)
        return True, 0
