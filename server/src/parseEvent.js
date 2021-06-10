import { json, buffer } from 'micro';

function parseAwsEvent(event) {
  let body = event?.body;
  if (event.isBase64Encoded) {
    body = Buffer.from(event.body, 'base64').toString();
  }

  try {
    body = JSON.parse(body);
    // eslint-disable-next-line
  } catch (err) {}

  let queryString = '';
  if (event.multiValueQueryStringParameters) {
    queryString = Object.entries(event.multiValueQueryStringParameters).map(([k, v]) => (
      v.map((val) => `${k}=${val}`).join('&')
    )).join('&');
    queryString = `?${queryString}`;
  }

  return {
    body,
    rawBody: event?.body,
    path: `${event.path}${queryString}`,
    headers: event.headers,
  };
}

async function parseMicroEvent(req) {
  const body = await json(req, { limit: '50mb' });
  const rawBody = await buffer(req, { limit: '50mb' });

  return {
    body,
    rawBody,
    path: req.url,
    headers: req.headers,
  };
}

export default function parseEvent(evtOrReq) {
  // eslint-disable-next-line
  const isEvt = evtOrReq.hasOwnProperty('isBase64Encoded');
  return isEvt ? parseAwsEvent(evtOrReq) : parseMicroEvent(evtOrReq);
}
