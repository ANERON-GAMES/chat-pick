import assert from "node:assert/strict";
import test from "node:test";
import {
  ActivityBand,
  MESSAGE_ACTIVITY_FIELDS,
  MESSAGE_TIME_FIELDS,
  MIN_PARTICIPANT_COUNT,
  MIN_TIME_MS,
  RECORD_TIME_FIELDS,
  chatActivityScore,
  getParticipantIds,
  mergeMessageLites,
  normalizeParticipantId,
  participantsMatch,
  pickBestMatchingChat,
  toTimeMs
} from "../src/index.js";

const hour = Date.parse("2026-09-30T19:30:00.000Z");
const now = Date.parse("2026-09-30T20:30:00.000Z");
const dayBefore = Date.parse("2026-09-29T19:30:00.000Z");

test("thresholds and activity bands stay fixed", () => {
  assert.equal(MIN_PARTICIPANT_COUNT, 1);
  assert.equal(MIN_TIME_MS, 1);
  assert.equal(ActivityBand.Message, "message");
  assert.equal(ActivityBand.Record, "record");
  assert.deepEqual(MESSAGE_ACTIVITY_FIELDS, ["lastMessageAt"]);
  assert.deepEqual(RECORD_TIME_FIELDS, ["updatedAt", "updated", "createdAt", "created"]);
  assert.deepEqual(MESSAGE_TIME_FIELDS, ["createdAt", "sentAt", "created"]);
  assert.equal(Object.isFrozen(ActivityBand), true);
  assert.equal(Object.isFrozen(MESSAGE_ACTIVITY_FIELDS), true);
  assert.equal(Object.isFrozen(RECORD_TIME_FIELDS), true);
  assert.equal(Object.isFrozen(MESSAGE_TIME_FIELDS), true);
  assert.throws(() => {
    ActivityBand.Message = "other";
  }, TypeError);
  assert.throws(() => {
    MESSAGE_TIME_FIELDS.push("updatedAt");
  }, TypeError);
});

test("participant ids trim strings and accept safe integers", () => {
  assert.equal(normalizeParticipantId("  ada  "), "ada");
  assert.equal(normalizeParticipantId("ada bo"), "ada bo");
  assert.equal(normalizeParticipantId("Ada"), "Ada");
  assert.equal(normalizeParticipantId("0"), "0");
  assert.equal(normalizeParticipantId(0), "0");
  assert.equal(normalizeParticipantId(1), "1");
  assert.equal(normalizeParticipantId(Number.MAX_SAFE_INTEGER), String(Number.MAX_SAFE_INTEGER));
});

test("participant ids reject blanks, fractions, and unsafe integers", () => {
  assert.equal(normalizeParticipantId(""), null);
  assert.equal(normalizeParticipantId("   "), null);
  assert.equal(normalizeParticipantId(1.5), null);
  assert.equal(normalizeParticipantId(Number.NaN), null);
  assert.equal(normalizeParticipantId(Number.POSITIVE_INFINITY), null);
  assert.equal(normalizeParticipantId(-1), null);
  assert.equal(normalizeParticipantId(Number.MAX_SAFE_INTEGER + 1), null);
  assert.equal(normalizeParticipantId(true), null);
  assert.equal(normalizeParticipantId(null), null);
  assert.equal(normalizeParticipantId({ id: "ada" }), null);
});

test("participant lists are unique and sorted without changing the input", () => {
  const participants = ["bo", "ada", "bo", " "];
  const chat = { participants };
  assert.deepEqual(getParticipantIds(chat), ["ada", "bo"]);
  assert.deepEqual(participants, ["bo", "ada", "bo", " "]);
  assert.deepEqual(getParticipantIds({ participants: ["2", "10"] }), ["10", "2"]);
  assert.deepEqual(getParticipantIds({ participants: [1, "1", " 1 "] }), ["1"]);
  assert.deepEqual(getParticipantIds({ participants: [{ id: " bo " }, { name: "no" }] }), ["bo"]);
  assert.deepEqual(getParticipantIds({ participants: [{ id: { id: "ada" } }, "bo"] }), ["bo"]);
  assert.deepEqual(getParticipantIds({ participants: ["ada", undefined, "bo"] }), ["ada", "bo"]);
});

test("a chat without a participant array has no participants", () => {
  assert.deepEqual(getParticipantIds(null), []);
  assert.deepEqual(getParticipantIds(["ada"]), []);
  assert.deepEqual(getParticipantIds({ participants: "ada" }), []);
  assert.deepEqual(getParticipantIds({}), []);
  assert.deepEqual(
    getParticipantIds({
      participants: [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1]
    }),
    [String(Number.MAX_SAFE_INTEGER)]
  );
});

test("the same participant set matches in either order", () => {
  assert.equal(participantsMatch(["bo", "ada"], [" ada ", { id: "bo" }, "ada"]), true);
  assert.equal(
    participantsMatch(
      { participants: ["bo", "ada"] },
      { participants: [{ id: "ada" }, { id: "bo" }, { id: "ada" }] }
    ),
    true
  );
  assert.equal(participantsMatch(["ada"], ["ada"]), true);
  assert.equal(participantsMatch([1], ["1"]), true);
});

test("different participant sets do not match", () => {
  assert.equal(participantsMatch(["ada", "bo"], ["ada", "bo", "cy"]), false);
  assert.equal(participantsMatch(["Ada"], ["ada"]), false);
  assert.equal(participantsMatch([], []), false);
  assert.equal(participantsMatch(null, null), false);
  assert.equal(participantsMatch(["ada"], []), false);
  assert.equal(participantsMatch([" ", ""], [" "]), false);
  assert.equal(participantsMatch({ id: "ada" }, ["ada"]), false);
});

test("numbers and dates become epoch milliseconds at or above the minimum", () => {
  assert.equal(toTimeMs(MIN_TIME_MS), MIN_TIME_MS);
  assert.equal(toTimeMs(1.5), 1.5);
  assert.equal(toTimeMs(now), now);
  assert.equal(toTimeMs(0), null);
  assert.equal(toTimeMs(-1), null);
  assert.equal(toTimeMs(Number.NaN), null);
  assert.equal(toTimeMs(Number.POSITIVE_INFINITY), null);
  assert.equal(toTimeMs(new Date(MIN_TIME_MS)), MIN_TIME_MS);
  assert.equal(toTimeMs(new Date(0)), null);
  assert.equal(toTimeMs(new Date(Number.NaN)), null);
  assert.equal(toTimeMs(null), null);
  assert.equal(toTimeMs(undefined), null);
  assert.equal(toTimeMs({}), null);
});

test("decimal strings are milliseconds and blank strings are missing", () => {
  assert.equal(toTimeMs("1700000000000"), 1700000000000);
  assert.equal(toTimeMs("  1700000000000.5 "), 1700000000000.5);
  assert.equal(toTimeMs("1"), 1);
  assert.equal(toTimeMs("0"), null);
  assert.equal(toTimeMs("0.5"), null);
  assert.equal(toTimeMs(""), null);
  assert.equal(toTimeMs("   "), null);
  assert.equal(toTimeMs("1e12"), null);
  assert.equal(toTimeMs("+1000"), null);
  assert.equal(toTimeMs("not-a-time"), null);
});

test("date-time strings with a zone match the same instant", () => {
  assert.equal(toTimeMs("2026-09-30T20:30:00.000Z"), now);
  assert.equal(toTimeMs("2026-09-30 20:30:00.000Z"), now);
  assert.equal(toTimeMs("  2026-09-30t20:30:00.000z  "), now);
  assert.equal(toTimeMs("2026-09-30T20:30:00Z"), now);
  assert.equal(toTimeMs("2026-09-30T20:30:00.5Z"), toTimeMs("2026-09-30T20:30:00.500Z"));
  assert.equal(toTimeMs("2026-09-30T20:30:00.12Z"), toTimeMs("2026-09-30T20:30:00.120Z"));
  assert.equal(toTimeMs("2026-09-30T20:30:00.000+00:00"), now);
  assert.equal(toTimeMs("2026-09-30T20:30:00.000+01:00"), hour);
  assert.equal(toTimeMs("2026-09-30T20:30:00.000-01:00"), now + 60 * 60 * 1000);
  assert.equal(toTimeMs("1970-01-01T00:00:00.000Z"), null);
  assert.equal(toTimeMs("1970-01-01T00:00:00.001Z"), MIN_TIME_MS);
  assert.equal(toTimeMs("2024-02-29T00:00:00.000Z"), Date.parse("2024-02-29T00:00:00.000Z"));
});

test("impossible or zone-less date-times are missing", () => {
  assert.equal(toTimeMs("2026-02-29T00:00:00.000Z"), null);
  assert.equal(toTimeMs("2026-02-31T00:00:00.000Z"), null);
  assert.equal(toTimeMs("2026-09-31T00:00:00.000Z"), null);
  assert.equal(toTimeMs("2026-13-01T00:00:00.000Z"), null);
  assert.equal(toTimeMs("2026-00-10T00:00:00.000Z"), null);
  assert.equal(toTimeMs("2026-09-30T24:00:00.000Z"), null);
  assert.equal(toTimeMs("2026-09-30T20:60:00.000Z"), null);
  assert.equal(toTimeMs("2026-09-30T20:30:60.000Z"), null);
  assert.equal(toTimeMs("2026-09-30T20:30:00.0000Z"), null);
  assert.equal(toTimeMs("2026-09-30T20:30:00.000"), null);
  assert.equal(toTimeMs("2026-09-30"), null);
  assert.equal(toTimeMs("0099-01-01T00:00:00.000Z"), null);
  assert.equal(toTimeMs("2026-09-30T20:30:00.000+24:00"), null);
});

test("a last message time outranks later bookkeeping times on the same chat", () => {
  const score = chatActivityScore({
    lastMessageAt: hour,
    updatedAt: now,
    createdAt: now
  });
  assert.deepEqual(score, { band: ActivityBand.Message, timeMs: hour });
  assert.equal(Object.isFrozen(score), true);
  const again = chatActivityScore({ lastMessageAt: hour });
  assert.notEqual(again, score);
  assert.deepEqual(again, score);
});

test("record time is the latest updated or created value", () => {
  assert.deepEqual(chatActivityScore({ createdAt: hour, updatedAt: now, updated: dayBefore }), {
    band: ActivityBand.Record,
    timeMs: now
  });
  assert.deepEqual(chatActivityScore({ created: now, updatedAt: hour }), {
    band: ActivityBand.Record,
    timeMs: now
  });
  assert.deepEqual(chatActivityScore({ lastMessageAt: "nope", updatedAt: hour }), {
    band: ActivityBand.Record,
    timeMs: hour
  });
  assert.deepEqual(chatActivityScore({ lastMessageAt: 0, createdAt: now }), {
    band: ActivityBand.Record,
    timeMs: now
  });
  assert.equal(chatActivityScore({ lastMessageAt: "nope", updatedAt: -5 }), null);
  assert.equal(chatActivityScore(null), null);
  assert.equal(chatActivityScore(["ada"]), null);
});

test("the activity score does not read messages or unknown fields", () => {
  const chat = {
    id: "live",
    participants: ["ada", "bo"],
    lastMessageAt: hour,
    touchedAt: now,
    get messages() {
      throw new Error("messages were read");
    },
    get text() {
      throw new Error("text was read");
    }
  };
  assert.deepEqual(chatActivityScore(chat), { band: ActivityBand.Message, timeMs: hour });
  assert.equal(pickBestMatchingChat([chat], ["bo", "ada"]), chat);
  const untouched = { id: "a", participants: ["ada"], createdAt: now, touchedAt: now + 99999 };
  const plain = { id: "b", participants: ["ada"], createdAt: now };
  assert.deepEqual(chatActivityScore(untouched), chatActivityScore(plain));
});

test("the readme example keeps the chat that already has a message time", () => {
  const older = {
    id: "chat-old",
    participants: ["ada", "bo"],
    lastMessageAt: hour,
    createdAt: dayBefore
  };
  const duplicate = {
    id: "chat-new",
    participants: [{ id: "bo" }, { id: "ada" }],
    createdAt: now
  };
  const chat = pickBestMatchingChat([duplicate, older], [" ada ", "bo"]);
  assert.equal(chat, older);
  assert.deepEqual(chatActivityScore(older), { band: ActivityBand.Message, timeMs: hour });
  assert.deepEqual(chatActivityScore(duplicate), { band: ActivityBand.Record, timeMs: now });
});

test("a duplicate with a later last message time wins", () => {
  const live = { id: "old", participants: ["ada", "bo"], lastMessageAt: hour };
  const alsoLive = {
    id: "new",
    participants: ["ada", "bo"],
    lastMessageAt: now,
    createdAt: now
  };
  assert.equal(pickBestMatchingChat([live, alsoLive], ["ada", "bo"]), alsoLive);
});

test("the earliest usable message time still beats a fresh row", () => {
  const ancient = { id: "old", participants: ["ada"], lastMessageAt: MIN_TIME_MS };
  const fresh = { id: "new", participants: ["ada"], createdAt: now };
  assert.equal(pickBestMatchingChat([fresh, ancient], ["ada"]), ancient);
});

test("without a message time the later record timestamp wins", () => {
  const older = { id: "old", participants: ["ada", "bo"], updatedAt: hour };
  const newer = { id: "new", participants: ["bo", "ada"], createdAt: now };
  assert.equal(pickBestMatchingChat([older, newer], ["ada", "bo"]), newer);
});

test("equal scores keep the smaller id, then the earlier chat", () => {
  const laterName = { id: "b", participants: ["ada"], createdAt: now, label: "b" };
  const earlierName = { id: "a", participants: ["ada"], createdAt: now, label: "a" };
  assert.equal(pickBestMatchingChat([laterName, earlierName], ["ada"]), earlierName);

  const first = { id: "same", participants: ["ada"], createdAt: now, label: "first" };
  const second = { id: "same", participants: ["ada"], createdAt: now, label: "second" };
  assert.equal(pickBestMatchingChat([first, second], ["ada"]), first);

  const named = { id: "z", participants: ["ada"], createdAt: now };
  const unnamed = { participants: ["ada"], createdAt: now };
  assert.equal(pickBestMatchingChat([unnamed, named], ["ada"]), named);

  const firstBlank = { participants: ["ada"], createdAt: now, label: "first" };
  const secondBlank = { participants: ["ada"], createdAt: now, label: "second" };
  assert.equal(pickBestMatchingChat([firstBlank, secondBlank], ["ada"]), firstBlank);
});

test("a score beats a smaller id, and a chat with no time loses", () => {
  const named = { id: "a", participants: ["ada"] };
  const dated = { id: "b", participants: ["ada"], createdAt: now };
  assert.equal(pickBestMatchingChat([named, dated], ["ada"]), dated);
});

test("an extra participant is a different conversation", () => {
  const group = {
    id: "group",
    participants: ["ada", "bo", "cy"],
    lastMessageAt: now
  };
  const direct = {
    id: "direct",
    participants: ["ada", "bo"],
    lastMessageAt: hour
  };
  assert.equal(pickBestMatchingChat([group, direct], ["ada", "bo"]), direct);
  assert.equal(pickBestMatchingChat([group, direct], direct), direct);
  assert.equal(pickBestMatchingChat([direct], [{ id: "ada" }, { id: "bo" }]), direct);
  assert.equal(pickBestMatchingChat([direct], { id: "ada" }), null);
});

test("no matching chat returns null and the input stays in place", () => {
  const low = { id: "low", participants: ["ada"], createdAt: hour };
  const high = { id: "high", participants: ["ada"], createdAt: now };
  const chats = Object.freeze([low, high, null, "nope"]);
  assert.equal(pickBestMatchingChat(chats, ["ada"]), high);
  assert.equal(chats[0], low);
  assert.equal(pickBestMatchingChat([], ["ada"]), null);
  assert.equal(pickBestMatchingChat(chats, []), null);
  assert.equal(pickBestMatchingChat(chats, [" ", ""]), null);
  assert.equal(pickBestMatchingChat(chats, undefined), null);
});

test("pickBestMatchingChat rejects a chats value that is not an array", () => {
  assert.throws(() => pickBestMatchingChat(null, ["ada"]), {
    name: "TypeError",
    message: "chats must be an array"
  });
  assert.throws(() => pickBestMatchingChat({ participants: ["ada"] }, ["ada"]), TypeError);
});

test("the readme merge keeps the first copy and sorts by time, then id", () => {
  const primary = [
    { id: "m2", createdAt: now, text: "second" },
    { id: "m1", createdAt: hour, text: "first" }
  ];
  const secondary = [
    { id: "m1", createdAt: now, text: "later copy" },
    { id: "m3", createdAt: now, text: "third" }
  ];
  const page = mergeMessageLites(primary, secondary);
  assert.deepEqual(
    page.map((message) => message.id),
    ["m1", "m2", "m3"]
  );
  assert.deepEqual(
    page.map((message) => message.text),
    ["first", "second", "third"]
  );
  assert.equal(page[0], primary[1]);
  assert.equal(page[1], primary[0]);
  assert.equal(page[2], secondary[1]);
  assert.deepEqual(
    primary.map((message) => message.id),
    ["m2", "m1"]
  );
});

test("a later duplicate does not replace the first message or its time", () => {
  const primary = [{ id: "m1", createdAt: hour, text: "keep" }];
  const secondary = [
    { id: " m1 ", createdAt: now, text: "drop" },
    { id: "m2", sentAt: now }
  ];
  const page = mergeMessageLites(primary, secondary);
  assert.equal(page.length, 2);
  assert.equal(page[0], primary[0]);
  assert.equal(page[1], secondary[1]);
});

test("message time uses createdAt before sentAt, and missing times sort last", () => {
  const page = mergeMessageLites(
    [
      { id: "m1", createdAt: now, sentAt: hour },
      { id: "m2", createdAt: "nope", sentAt: hour },
      { id: "m4" },
      { id: "m3" }
    ],
    []
  );
  assert.deepEqual(
    page.map((message) => message.id),
    ["m2", "m1", "m3", "m4"]
  );
});

test("tied message times sort by id in code unit order", () => {
  const page = mergeMessageLites(
    [
      { id: 2, createdAt: now },
      { id: "10", createdAt: now }
    ],
    [{ id: "m0", created: hour }]
  );
  assert.deepEqual(
    page.map((message) => normalizeParticipantId(message.id)),
    ["m0", "10", "2"]
  );
});

test("a merge does not read message text", () => {
  const first = {
    id: "m1",
    createdAt: now,
    get text() {
      throw new Error("text was read");
    }
  };
  const page = mergeMessageLites([first], null);
  assert.equal(page[0], first);
});

test("messages without a usable id are omitted", () => {
  const kept = { id: 0, createdAt: now, text: "zero" };
  const page = mergeMessageLites(
    [null, 1, "m", { id: { id: "nested" } }, { text: "no id" }, kept],
    [{ id: "  ", createdAt: now }]
  );
  assert.deepEqual(page, [kept]);
});

test("null pages are empty and a non-array page throws", () => {
  assert.deepEqual(mergeMessageLites(null, null), []);
  assert.deepEqual(mergeMessageLites(), []);
  assert.deepEqual(
    mergeMessageLites(null, [{ id: "m1", createdAt: now }]).map((message) => message.id),
    ["m1"]
  );
  const frozen = Object.freeze([
    { id: "m2", createdAt: now },
    { id: "m1", createdAt: hour }
  ]);
  assert.deepEqual(
    mergeMessageLites(frozen, Object.freeze([])).map((message) => message.id),
    ["m1", "m2"]
  );
  assert.throws(() => mergeMessageLites("no", []), {
    name: "TypeError",
    message: "primary must be an array or null"
  });
  assert.throws(() => mergeMessageLites([], 4), {
    name: "TypeError",
    message: "secondary must be an array or null"
  });
  assert.throws(() => mergeMessageLites("no", 4), {
    name: "TypeError",
    message: "primary must be an array or null"
  });
});
