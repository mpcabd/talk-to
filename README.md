# Talk To

I have been having lots of calls, meetings, and appointments lately, and scheduling those has become annoying, with lots of messages exchanged between me and other people to agree on a good time to meet. Especially that I have to check my personal calendar, our family's calendar, and my work calendar, which usually are not accessible from one device. I tried [Calendly](calendly.com), it was nice, but in order for me to use it well with it figuring out my availability and cross it with multiple calendars, then I'd have to pay for it's ultimate subscription, and still maybe I'd have to do a lot of manual work to set it up. So I wrote this simple web application.

This web application loads multiple calendars, the calendars must be exposed as `.ics` URLs on the web, this works pretty well with Google Calendars as it allows you to get an `.ics` URL for your calendar. It refreshes those calendars periodically. You can set up your default weekly availability hours, and the application will cross those with the events on your calendar to determine when you should be available.

You can view it live here on my own page: https://talk-to.mpcabd.xyz/

You can make a copy of this application, make your own configuration, build an image, and deploy it to some cloud of your liking.

## Configuration

Check [`config.json`](config.json) to see the configuration file. The `weekday_availability` key is an array that sets your default daily availability, each item in `weekday_availability` is the availability for a day, first day is Monday, each day is also an array of time-ranges, each range is an array of two timestamps `HH:MM`. For example:

```javascript
"weekday_availability": [
  // Monday 9am to 6pm with a lunch break between 1pm and 2pm
  [["09:00", "13:00"], ["14:00", "18:00"]],

  // Tuesday 9am to 6pm with a lunch break between 1pm and 2pm
  [["09:00", "13:00"], ["14:00", "18:00"]],

  // Wednesday 9am to 6pm with a lunch break between 1pm and 2pm
  [["09:00", "13:00"], ["14:00", "18:00"]],

  // Thursday 9am to 6pm with a lunch break between 1pm and 2pm
  [["09:00", "13:00"], ["14:00", "18:00"]],

  // Friday 9am to 6pm with a long break between 12pm and 2.30pm and a long break between 3pm and 5pm
  [["09:00", "12:00"], ["14:30", "15:00"], ["17:00", "18:00"]],

  // Saturday not available
  [],

  // Sunday not available
  []
]
```

You can define as many time-ranges as you like per day, just make sure they don't intersect.

## In production

### `hypercorn.prod.toml`
```
debug = false
use_reloader = false
startup_timeout = 60
loglevel = 'ERROR'
server_names = 'my.domain.tld'
accesslog = '/path/to/access.log'
errorlog = '/path/to/error.log'
```

### `prod.env`:
```
QUART_APP=__init__.py
QUART_ENV=production
QUART_SECRET_KEY=<SECRET KEY>
QUART_SERVER_NAME=my.domain.tld
QUART_PREFERRED_URL_SCHEME=https
QUART_LOG_LEVEL=ERROR
PORT=80
PYTHONDONTWRITEBYTECODE=1
PYTHONUNBUFFERED=1
HYPERCORN_CONFIG_FILE=hypercorn.prod.toml
```

You can obtain a secret key like this: `docker run python:3-alpine python -c 'import secrets; print(secrets.base64.b64encode(secrets.token_bytes(50)))'`

You might want to run this behind nginx or traefik so that they'd handle the secure connection for you.

The file [`docker-compose.prod.yml`](docker-compose.prod.yml) is only provided as a reference, you should be able to change anything to your liking and deploy it the way you want.

If you've changed the `config.json` file and don't want to do a full rollout, you can do a `POST` request to `/reload` and the app will reload the config and refresh its calendars.

## Decisions made

* Used [Quart](https://pgjones.gitlab.io/quart/) instead of [Flask](https://flask.palletsprojects.com/) because I wanted to use `asyncio` to run routines in the background.
* Used [Vue](https://v3.vuejs.org/) for the frontend because it's the easiest way I know to do DOM binding.
* Used [Bootstrap](https://getbootstrap.com/) because I am bad at anything front-end.
* Used [axios](https://github.com/axios/axios) because I wanted the simplest way to do HTTP calls without writing too much.
* Used [luxon](https://moment.github.io/luxon/) because I have used momentjs before and I still don't know how to do dates, times, and timezones well in JavaScript.
* Made my own calendar widget because I didn't want to use another library.
* Default user photo is taken from [here](https://www.pexels.com/photo/men-s-wearing-black-suit-jacket-and-pants-937481/)

Can it be made much better? **Certainly!** but this was a quick and dirty solution to an annoying problem, not meant to be a product for the general public.

## An honest apology for all front-end developers

As you probably can tell, my front-end skills are outdated and probably bad, so I apologise for all front-end developers who look at my code and feel rage boiling up because of how bad it is. Please take some time if you're reading this to maybe propose a better way of doing the front-end work. I have very quickly read some Vue documentation to be able to put this together, but in no way is that a representative of how I code the backend 😅

## License

This work is licensed under
[MIT License](https://opensource.org/licenses/MIT).
