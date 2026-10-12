export const MIN_PARTICIPANT_COUNT = 1;
export const MIN_TIME_MS = 1;

export const ActivityBand = Object.freeze({
  Message: "message",
  Record: "record"
});

export const MESSAGE_ACTIVITY_FIELDS = Object.freeze(["lastMessageAt"]);

export const RECORD_TIME_FIELDS = Object.freeze(["updatedAt", "updated", "createdAt", "created"]);

export const MESSAGE_TIME_FIELDS = Object.freeze(["createdAt", "sentAt", "created"]);

const ACTIVITY_PRECEDENCE = Object.freeze([ActivityBand.Message, ActivityBand.Record]);
const MAX_FRACTION_DIGITS = 3;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const MS_PER_MINUTE = SECONDS_PER_MINUTE * MS_PER_SECOND;
const MS_PER_HOUR = MINUTES_PER_HOUR * MS_PER_MINUTE;

export function normalizeParticipantId(value) {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      return null;
    }
    return String(value);
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed;
}

export function getParticipantIds(chat) {
  if (!isRecord(chat)) {
    return [];
  }
  return uniqueParticipantIds(chat.participants);
}

export function participantsMatch(left, right) {
  return sameParticipantIds(resolveParticipantIds(left), resolveParticipantIds(right));
}

export function toTimeMs(value) {
  if (typeof value === "number") {
    return finiteTimeMs(value);
  }
  if (value instanceof Date) {
    return finiteTimeMs(value.getTime());
  }
  if (typeof value !== "string") {
    return null;
  }
  return timeMsFromString(value);
}

export function chatActivityScore(chat) {
  if (!isRecord(chat)) {
    return null;
  }
  const messageTime = latestTimeMs(chat, MESSAGE_ACTIVITY_FIELDS);
  if (messageTime != null) {
    return freezeScore(ActivityBand.Message, messageTime);
  }
  const recordTime = latestTimeMs(chat, RECORD_TIME_FIELDS);
  if (recordTime != null) {
    return freezeScore(ActivityBand.Record, recordTime);
  }
  return null;
}

export function pickBestMatchingChat(chats, participants) {
  if (!Array.isArray(chats)) {
    throw new TypeError("chats must be an array");
  }
  const wanted = resolveParticipantIds(participants);
  if (wanted.length < MIN_PARTICIPANT_COUNT) {
    return null;
  }
  let best = null;
  let bestScore = null;
  let bestId = null;
  for (const chat of chats) {
    if (!isRecord(chat) || !sameParticipantIds(getParticipantIds(chat), wanted)) {
      continue;
    }
    const score = chatActivityScore(chat);
    const id = normalizeParticipantId(chat.id);
    if (best == null || compareChatRank(score, id, bestScore, bestId) < 0) {
      best = chat;
      bestScore = score;
      bestId = id;
    }
  }
  return best;
}

export function mergeMessageLites(primary, secondary) {
  const merged = [];
  const seen = new Set();
  collectMessages(requireMessagePage(primary, "primary"), seen, merged);
  collectMessages(requireMessagePage(secondary, "secondary"), seen, merged);
  merged.sort(compareMergedMessages);
  return merged;
}

function isRecord(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function uniqueParticipantIds(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  const seen = new Set();
  const ids = [];
  for (const value of values) {
    const id = participantIdFromValue(value);
    if (id == null || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }
  ids.sort(compareIds);
  return ids;
}

function participantIdFromValue(value) {
  if (isRecord(value)) {
    return normalizeParticipantId(value.id);
  }
  return normalizeParticipantId(value);
}

function resolveParticipantIds(value) {
  if (Array.isArray(value)) {
    return uniqueParticipantIds(value);
  }
  return getParticipantIds(value);
}

function sameParticipantIds(left, right) {
  if (left.length < MIN_PARTICIPANT_COUNT || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function latestTimeMs(record, fields) {
  let best = null;
  for (const field of fields) {
    const time = toTimeMs(record[field]);
    if (time == null) {
      continue;
    }
    if (best == null || time > best) {
      best = time;
    }
  }
  return best;
}

function firstTimeMs(record, fields) {
  for (const field of fields) {
    const time = toTimeMs(record[field]);
    if (time != null) {
      return time;
    }
  }
  return null;
}

function freezeScore(band, timeMs) {
  return Object.freeze({
    band,
    timeMs
  });
}

function compareChatRank(leftScore, leftId, rightScore, rightId) {
  const byScore = compareScoreDescending(leftScore, rightScore);
  if (byScore !== 0) {
    return byScore;
  }
  return compareIds(leftId, rightId);
}

function compareScoreDescending(left, right) {
  if (left == null && right == null) {
    return 0;
  }
  if (left == null) {
    return 1;
  }
  if (right == null) {
    return -1;
  }
  const leftBand = bandIndex(left.band);
  const rightBand = bandIndex(right.band);
  if (leftBand !== rightBand) {
    return leftBand - rightBand;
  }
  if (left.timeMs !== right.timeMs) {
    return left.timeMs > right.timeMs ? -1 : 1;
  }
  return 0;
}

function bandIndex(band) {
  const index = ACTIVITY_PRECEDENCE.indexOf(band);
  if (index < 0) {
    return ACTIVITY_PRECEDENCE.length;
  }
  return index;
}

function compareIds(left, right) {
  if (left == null && right == null) {
    return 0;
  }
  if (left == null) {
    return 1;
  }
  if (right == null) {
    return -1;
  }
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function requireMessagePage(page, label) {
  if (page == null) {
    return [];
  }
  if (!Array.isArray(page)) {
    throw new TypeError(`${label} must be an array or null`);
  }
  return page;
}

function collectMessages(page, seen, merged) {
  for (const message of page) {
    if (!isRecord(message)) {
      continue;
    }
    const id = normalizeParticipantId(message.id);
    if (id == null || seen.has(id)) {
      continue;
    }
    seen.add(id);
    merged.push(message);
  }
}

function compareMergedMessages(left, right) {
  const byTime = compareTimeAscending(
    firstTimeMs(left, MESSAGE_TIME_FIELDS),
    firstTimeMs(right, MESSAGE_TIME_FIELDS)
  );
  if (byTime !== 0) {
    return byTime;
  }
  return compareIds(normalizeParticipantId(left.id), normalizeParticipantId(right.id));
}

function compareTimeAscending(left, right) {
  if (left == null && right == null) {
    return 0;
  }
  if (left == null) {
    return 1;
  }
  if (right == null) {
    return -1;
  }
  if (left !== right) {
    return left < right ? -1 : 1;
  }
  return 0;
}

function finiteTimeMs(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < MIN_TIME_MS) {
    return null;
  }
  return value;
}

function timeMsFromString(value) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return finiteTimeMs(Number(trimmed));
  }
  return timeMsFromIso(trimmed);
}

function timeMsFromIso(value) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|z|[+-]\d{2}:\d{2})$/.exec(
      value
    );
  if (match == null) {
    return null;
  }
  const millisecond = millisecondsFromFraction(match[7]);
  const zoneOffset = zoneOffsetMs(match[8]);
  if (millisecond == null || zoneOffset == null) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (
    !inRange(month, 1, 12) ||
    !inRange(day, 1, 31) ||
    !inRange(hour, 0, 23) ||
    !inRange(minute, 0, 59) ||
    !inRange(second, 0, 59)
  ) {
    return null;
  }
  const wall = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const check = new Date(wall);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return finiteTimeMs(wall - zoneOffset);
}

function millisecondsFromFraction(fraction) {
  if (fraction == null) {
    return 0;
  }
  if (fraction.length > MAX_FRACTION_DIGITS) {
    return null;
  }
  return Number(fraction.padEnd(MAX_FRACTION_DIGITS, "0"));
}

function zoneOffsetMs(zone) {
  if (zone === "Z" || zone === "z") {
    return 0;
  }
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(zone);
  if (match == null) {
    return null;
  }
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (!inRange(hours, 0, 23) || !inRange(minutes, 0, 59)) {
    return null;
  }
  const magnitude = hours * MS_PER_HOUR + minutes * MS_PER_MINUTE;
  if (magnitude === 0) {
    return 0;
  }
  if (match[1] === "-") {
    return -magnitude;
  }
  return magnitude;
}

function inRange(value, min, max) {
  return value >= min && value <= max;
}
