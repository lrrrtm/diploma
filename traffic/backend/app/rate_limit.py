import time
from collections import deque


class SlidingWindowRateLimiter:
    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._buckets: dict[str, deque[float]] = {}

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        bucket = self._buckets.setdefault(key, deque())
        threshold = now - self.window_seconds
        while bucket and bucket[0] < threshold:
            bucket.popleft()
        if len(bucket) >= self.max_requests:
            return False
        bucket.append(now)
        return True


pin_lookup_limiter = SlidingWindowRateLimiter(max_requests=25, window_seconds=60)
