import aiohttp
import arrow
import asyncio
import heapq
import ics
import json
import logging


class HoldingIterator:
    def __init__(self, iterator):
        self.iterator = iterator
        self.last_value = None
        self.advanced = False

    def __next__(self):
        self.last_value = next(self.iterator)
        self.advanced = True
        return self.last_value


async def _get_calendar(session, url):
    async with session.get(url) as resp:
        calendar = ics.Calendar(await resp.text())
        return calendar


def _arrow_to_hhmm(arrow_obj):
    return '%02d:%02d' % (arrow_obj.hour, arrow_obj.minute)


def _local_hhmm_to_utc_arrow(hhmm, timezone, date):
    return date.replace(
        hour=int(hhmm.split(':')[0]),
        minute=int(hhmm.split(':')[1]),
        second=0,
        microsecond=0,
        tzinfo=timezone,
    ).to('utc')


class TalkTo:
    def __init__(self):
        self.state_lock = asyncio.Lock()
        self.last_update = arrow.utcnow()
        self.calendars = None
        self.refresh_task = None
        self.load_config()
        self._logger = None

    def load_config(self):
        with open('config.json') as fp:
            self.config = json.load(fp)

    @property
    def urls(self):
        return self.config['calendars']

    @property
    def refresh_delay(self):
        return self.config['refresh_delay']

    @property
    def timezone(self):
        return self.config['timezone']

    @property
    def timezone_as_offset(self):
        return arrow.utcnow().to(self.timezone).strftime('%z')

    @property
    def logger(self):
        if not self._logger:
            self._logger = logging.getLogger(str(self.__class__))
            self._logger.setLevel(logging.DEBUG)
        return self._logger

    @logger.setter
    def logger(self, logger):
        self._logger = logger

    def weekday_availability(self, weekday):
        return self.config["weekday_availability"][weekday][:]

    async def refresh_calendars(self):
        self.logger.info('will refresh the calendars')
        async with aiohttp.ClientSession() as session:
            tasks = [
                asyncio.ensure_future(_get_calendar(session, url))
                for url in self.urls
            ]
            new_calendars = await asyncio.gather(*tasks)
        async with self.state_lock:
            self.calendars = new_calendars
            self.last_update = arrow.utcnow()
        self.logger.info('refreshed the calendars')

    async def start_refresh_task(self, first_run=False, cancel_task=False):
        if not first_run:
            await asyncio.sleep(self.refresh_delay)
        if cancel_task and self.refresh_task:
            self.refresh_task.cancel()
        await self.refresh_calendars()
        self.refresh_task = asyncio.create_task(self.start_refresh_task())

    async def get_timelines(self, start_arrow=None):
        if not start_arrow:
            start_arrow = arrow.utcnow()
        async with self.state_lock:
            return list([
                c.timeline.start_after(start_arrow)
                for c in self.calendars
            ])

    async def timelines_iterator(self, start_date):
        timelines = await self.get_timelines(start_date)
        iterator = HoldingIterator(heapq.merge(*timelines))
        return iterator

    def get_date_availability(self, date, events_iterator):
        date_availability = self.weekday_availability(date.weekday())
        if not date_availability:
            return []
        if not events_iterator.advanced:
            current_event = next(events_iterator)
        else:
            current_event = events_iterator.last_value
        while current_event and current_event.end < date:
            current_event = next(events_iterator, None)

        result = []
        while date_availability:
            av_start, av_end = date_availability[0]
            if av_start == av_end:
                app.logger.error(f'got instant av f{av_start} on {date}')
                date_availability.pop(0)
                continue

            av_start_arrow = _local_hhmm_to_utc_arrow(
                av_start,
                self.timezone,
                date
            )
            av_end_arrow = _local_hhmm_to_utc_arrow(
                av_end,
                self.timezone,
                date
            )

            self.logger.debug(
                f'Current span {av_start_arrow.strftime("%H:%M")}'
                f' - {av_end_arrow.strftime("%H:%M")}')
            self.logger.debug(f'Current event {repr(current_event)}')

            # event begins after this availability span ends or with its end
            # -------AAAAAAAAAAAAA-------
            # --------------------EEEEE--
            # ----------------------EEE--
            if current_event.begin >= av_end_arrow:
                self.logger.debug(f'>>1')
                result.append((
                    _arrow_to_hhmm(av_start_arrow),
                    _arrow_to_hhmm(av_end_arrow),
                ))
                date_availability.pop(0)
                continue

            # event ends before this availability span starts or with its start
            # -------AAAAAAAAAAAAA-------
            # --EEEEE--------------------
            # --EEE----------------------
            if current_event.end <= av_start_arrow:
                self.logger.debug(f'>>2')
                current_event = next(events_iterator, None)
                continue

            # event begins before this availability span or with it
            # and ends with it or after it
            # -------AAAAAAAAAAAAA-------
            # -----EEEEEEEEEEEEEEE-------
            # -----EEEEEEEEEEEEEEEEE-----
            # -------EEEEEEEEEEEEE-------
            # -------EEEEEEEEEEEEEEE-----
            if (
                current_event.begin <= av_start_arrow and
                current_event.end >= av_end_arrow
            ):
                self.logger.debug(f'>>3')
                date_availability.pop(0)
                if current_event.end == av_end_arrow:
                    current_event = next(events_iterator, None)
                continue

            # event begins before this availability span or with it
            # and ends within it
            # -------AAAAAAAAAAAAA-------
            # -----EEEEEEEEEEE-----------
            # -------EEEEEEEEE-----------
            if (
                current_event.begin <= av_start_arrow and
                current_event.end < av_end_arrow
            ):
                self.logger.debug(f'>>4')
                # replace this availability span with one that starts after
                # the event
                date_availability[0] = (
                    _arrow_to_hhmm(current_event.end.to(self.timezone)),
                    av_end
                )
                current_event = next(events_iterator, None)
                continue

            # event begins within this availability span
            # and ends within it or with it
            # -------AAAAAAAAAAAAA-------
            # ---------EEEEEEEEEEE-------
            # -----------EEEEEEEEEEE-----
            if (
                current_event.begin > av_start_arrow and
                current_event.end >= av_end_arrow
            ):
                self.logger.debug(f'>>5')
                result.append((
                    _arrow_to_hhmm(av_start_arrow),
                    _arrow_to_hhmm(current_event.begin)
                ))
                date_availability.pop(0)
                if current_event.end == av_end_arrow:
                    current_event = next(events_iterator, None)
                continue

            # event begins and ends within this availability span
            # -------AAAAAAAAAAAAA-------
            # ----------EEEEEE-----------
            if (
                current_event.begin > av_start_arrow and
                current_event.end < av_end_arrow
            ):
                self.logger.debug(f'>>6')
                # availability before the event
                result.append((
                    _arrow_to_hhmm(av_start_arrow),
                    _arrow_to_hhmm(current_event.begin)
                ))

                # availability after the event
                date_availability[0] = (
                    _arrow_to_hhmm(current_event.end.to(self.timezone)),
                    av_end
                )
                current_event = next(events_iterator, None)
                continue

        return result
