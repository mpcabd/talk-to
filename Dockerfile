FROM python:3.9-alpine

RUN apk add --no-cache gcc python3-dev musl-dev

RUN pip install --upgrade pip

WORKDIR /usr/src/app

COPY ./requirements.txt /usr/src/app/requirements.txt

RUN pip install --no-cache-dir -r /usr/src/app/requirements.txt

COPY . /usr/src/app/

CMD hypercorn -c $HYPERCORN_CONFIG_FILE -b 0.0.0.0:$PORT __init__:app
