import asyncio
from collections import defaultdict


class TabletRealtimeHub:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._offline_grace_seconds = 20.0
        self.online_tablets: set[str] = set()
        self._tablet_connections: dict[str, int] = defaultdict(int)
        self._offline_tasks: dict[str, asyncio.Task[None]] = {}
        self._status_subscribers: set[asyncio.Queue[str]] = set()
        self._tablet_subscribers: dict[str, set[asyncio.Queue[str]]] = defaultdict(set)

    async def set_online(self, tablet_id: str) -> None:
        should_publish = False
        async with self._lock:
            pending_offline = self._offline_tasks.pop(tablet_id, None)
            if pending_offline is not None:
                pending_offline.cancel()
            self._tablet_connections[tablet_id] += 1
            # Publish only on real transition offline -> online.
            if self._tablet_connections[tablet_id] == 1:
                self.online_tablets.add(tablet_id)
                should_publish = True
        if should_publish:
            await self.publish_status()

    async def set_offline(self, tablet_id: str) -> None:
        schedule_delayed_offline = False
        async with self._lock:
            current = self._tablet_connections.get(tablet_id, 0)
            if current <= 1:
                self._tablet_connections.pop(tablet_id, None)
                if tablet_id in self.online_tablets and tablet_id not in self._offline_tasks:
                    schedule_delayed_offline = True
            else:
                self._tablet_connections[tablet_id] = current - 1
        if schedule_delayed_offline:
            task = asyncio.create_task(
                self._mark_offline_after_grace(tablet_id),
                name=f"tablet-offline-grace-{tablet_id}",
            )
            async with self._lock:
                self._offline_tasks[tablet_id] = task

    async def subscribe_status(self) -> asyncio.Queue[str]:
        queue: asyncio.Queue[str] = asyncio.Queue()
        async with self._lock:
            self._status_subscribers.add(queue)
        return queue

    async def unsubscribe_status(self, queue: asyncio.Queue[str]) -> None:
        async with self._lock:
            self._status_subscribers.discard(queue)

    async def subscribe_tablet(self, tablet_id: str) -> asyncio.Queue[str]:
        queue: asyncio.Queue[str] = asyncio.Queue()
        async with self._lock:
            self._tablet_subscribers[tablet_id].add(queue)
        return queue

    async def unsubscribe_tablet(self, tablet_id: str, queue: asyncio.Queue[str]) -> None:
        async with self._lock:
            subscribers = self._tablet_subscribers.get(tablet_id)
            if not subscribers:
                return
            subscribers.discard(queue)
            if not subscribers:
                self._tablet_subscribers.pop(tablet_id, None)

    async def publish_status(self) -> None:
        async with self._lock:
            subscribers = list(self._status_subscribers)
        for queue in subscribers:
            self._safe_signal(queue)

    async def publish_tablet(self, tablet_id: str) -> None:
        async with self._lock:
            subscribers = list(self._tablet_subscribers.get(tablet_id, set()))
        for queue in subscribers:
            self._safe_signal(queue)

    async def get_online_tablets(self) -> set[str]:
        async with self._lock:
            return set(self.online_tablets)

    async def _mark_offline_after_grace(self, tablet_id: str) -> None:
        try:
            await asyncio.sleep(self._offline_grace_seconds)
            should_publish = False
            async with self._lock:
                current = self._tablet_connections.get(tablet_id, 0)
                self._offline_tasks.pop(tablet_id, None)
                if current == 0 and tablet_id in self.online_tablets:
                    self.online_tablets.discard(tablet_id)
                    should_publish = True
            if should_publish:
                await self.publish_status()
        except asyncio.CancelledError:
            return

    @staticmethod
    def _safe_signal(queue: asyncio.Queue[str]) -> None:
        try:
            queue.put_nowait("update")
        except asyncio.QueueFull:
            pass


hub = TabletRealtimeHub()
