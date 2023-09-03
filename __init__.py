import arrow
import asyncio
import os
import logging.config

from talk_to import TalkTo
from quart import (
    abort,
    jsonify,
    Quart,
    render_template,
    request,
)

logging.config.dictConfig({
    'version': 1,
    'loggers': {
        'quart.app': {
            'level': os.getenv('QUART_LOG_LEVEL', 'DEBUG'),
        },
        'quart.serving': {
            'level': os.getenv('QUART_LOG_LEVEL', 'DEBUG'),
        },
    },
})

app = Quart(__name__)

talk_to = TalkTo()
talk_to.logger = app.logger


@app.before_serving
async def refresh_calendars():
    await talk_to.start_refresh_task(first_run=True)


@app.route("/")
async def index():
    return await render_template(
        'index.html',
        name=talk_to.config.get('name', 'me'),
        email=talk_to.config.get('email', ''),
        links=talk_to.config.get('links', []),
    )


@app.route("/robots.txt")
async def robots():
    return (
        "User-agent: *\nDisallow: /\n",
        [('Content-Type', 'text/plain; charset=UTF-8')]
    )


@app.route("/reload", methods=["POST"])
async def reload():
    talk_to.load_config()
    app.logger.info('will reload')
    asyncio.create_task(talk_to.start_refresh_task(
        first_run=True,
        cancel_task=True
    ))
    return jsonify(ok=True)


@app.route("/reload-status")
async def reload_status():
    task = talk_to.refresh_task
    if not task:
        return jsonify(ok=False, error="Task not found")
    if task.done():
        try:
            exception = task.exception()
            return jsonify(ok=False, error="Task had an exception", exception_message=str(exception))
        except asyncio.CancelledError:
            return jsonify(ok=False, error="Task was cancelled")
        try:
            result = task.result()
            return jsonify(ok=False, error="Task was done", result=str(result))
        except asyncio.CancelledError:
            return jsonify(ok=False, error="Task was cancelled")
    else:
        return jsonify(ok=True, message="Task is running")


@app.route("/availability")
async def availability():
    if request.args.get("start_date"):
        try:
            start_date = arrow.get(request.args.get("start_date"))
        except arrow.parser.ParserError:
            abort(400, {"error": "start date is invalid"})
    else:
        start_date = arrow.utcnow().floor('day')
    if request.args.get("end_date"):
        try:
            end_date = arrow.get(request.args.get("end_date"))
        except arrow.parser.ParserError:
            abort(400, {"error": "end date is invalid"})
    else:
        end_date = start_date.shift(days=14)
    if (end_date - start_date).days > 60:
        abort(400, {"error": "cannot show availability for more than 60 days"})
    iterator = await talk_to.timelines_iterator(start_date)
    data = []
    date = start_date
    while date <= end_date:
        data.append((date.strftime('%Y-%m-%d'), talk_to.get_date_availability(
            date,
            iterator
        )))
        date = date.shift(days=1)
    return {
        'data': data,
        'next-date': end_date.shift(days=1).for_json(),
        'end-date': end_date.for_json(),
        'last-update': talk_to.last_update.for_json(),
        'start-date': start_date.for_json(),
        'timezone': talk_to.timezone,
        'timezone_as_offset': talk_to.timezone_as_offset,
    }


if __name__ == "__main__":
    app.run(debug=os.getenv('QUART_ENV', '') == 'development')
