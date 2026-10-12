# chat-pick

When several chats list the same participants, keep the one that was actually in use. When two message pages overlap, merge them by id and put them in time order.

Duplicate chats appear when two writers each create the same conversation. The pick compares timestamps that are already on the chat. It does not walk the messages. A last message time outranks a chat that was only created or updated, so a fresh empty duplicate loses to the conversation that already has one.

A merged page keeps the first copy of each id. The page then sorts by message time, oldest first. Equal times break toward the smaller id. Message text stays on the object that won. The merge does not read it.

## Install

The package is an ES module. It needs Node.js 20 or newer. It has no runtime dependencies. The package name is `@aneron/chat-pick`. It is not published to the npm registry.

Clone this repository and run the tests:

```bash
git clone https://github.com/ANERON-GAMES/chat-pick.git
cd chat-pick
npm install
npm test
```

`npm test` runs `node --test`. `npm run lint` runs ESLint. `npm run format:check` runs Prettier.

Install it as a dependency from the git repository:

```bash
npm install github:ANERON-GAMES/chat-pick
```

```js
import { mergeMessageLites, pickBestMatchingChat } from "@aneron/chat-pick";
```

Code in this repository imports the same entry point with `./src/index.js`.

## Usage

Pass the chats and the participant list. Participant order does not matter. A wrapped id and a bare string are the same participant.

```js
import { mergeMessageLites, pickBestMatchingChat } from "@aneron/chat-pick";

const hour = Date.parse("2026-09-30T19:30:00.000Z");
const now = Date.parse("2026-09-30T20:30:00.000Z");

const older = {
  id: "chat-old",
  participants: ["ada", "bo"],
  lastMessageAt: hour,
  createdAt: Date.parse("2026-09-29T19:30:00.000Z")
};

const duplicate = {
  id: "chat-new",
  participants: [{ id: "bo" }, { id: "ada" }],
  createdAt: now
};

const chat = pickBestMatchingChat([duplicate, older], [" ada ", "bo"]);
```

`chat` is `older`. The duplicate was created an hour later, and it has no last message time, so it loses. `createdAt` on `older` is a day earlier and is not the score. The message time is.

Two pages of messages merge the same way. The first page supplies `m1`. The second page's copy of `m1` is dropped, including its later timestamp. `m2` and `m3` share a timestamp, so the smaller id comes first.

```js
const page = mergeMessageLites(
  [
    { id: "m2", createdAt: now, text: "second" },
    { id: "m1", createdAt: hour, text: "first" }
  ],
  [
    { id: "m1", createdAt: now, text: "later copy" },
    { id: "m3", createdAt: now, text: "third" }
  ]
);
```

`page` is `m1`, then `m2`, then `m3`. The text values are `"first"`, `"second"`, and `"third"`.

## API reference

All functions are pure. They do not read the clock, the network, or the filesystem. They do not modify the objects or arrays you pass in.

### Constants

| Export                    | Value                                              | Meaning                                                                                      |
| ------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `MIN_PARTICIPANT_COUNT`   | `1`                                                | A participant set shorter than this matches nothing.                                         |
| `MIN_TIME_MS`             | `1`                                                | A timestamp below this is missing. Zero and negative values are missing.                     |
| `ActivityBand.Message`    | `"message"`                                        | The chat has a usable `lastMessageAt`.                                                       |
| `ActivityBand.Record`     | `"record"`                                         | The chat has no usable last message time. The score uses the latest updated or created time. |
| `MESSAGE_ACTIVITY_FIELDS` | `["lastMessageAt"]`                                | Fields read for a message-band score.                                                        |
| `RECORD_TIME_FIELDS`      | `["updatedAt", "updated", "createdAt", "created"]` | Fields read for a record-band score. The latest usable value wins.                           |
| `MESSAGE_TIME_FIELDS`     | `["createdAt", "sentAt", "created"]`               | Fields read when sorting a message page. The first usable value wins.                        |

`ActivityBand`, `MESSAGE_ACTIVITY_FIELDS`, `RECORD_TIME_FIELDS`, and `MESSAGE_TIME_FIELDS` are frozen.

`ActivityBand.Message` outranks `ActivityBand.Record`. A chat with a last message time is ahead of a chat that only has updated or created times, including a duplicate whose created time is later.

### `normalizeParticipantId(value)`

Return the canonical participant id, or `null` when the value cannot be one.

| Input                     | Result                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| non-negative safe integer | Its decimal string. `1` and `"1"` are the same id. `0` is `"0"`.                                            |
| other number              | `null`. Negatives, fractions, `NaN`, infinities, and integers outside the safe range are rejected.          |
| string                    | Trimmed. An empty result is `null`. Case is preserved. Internal spaces stay.                                |
| anything else             | `null`. Objects are not ids. `getParticipantIds` reads an object's `id` field before calling this function. |

### `getParticipantIds(chat)`

Return the unique participant ids of a chat, sorted by UTF-16 code unit, ascending.

`chat` is an object with an optional `participants` array. Each entry is a string, a non-negative safe integer, or an object with an `id`. Entries that do not normalize are dropped. Duplicate ids collapse.

A missing chat, an array, or a chat whose `participants` value is not an array returns `[]`. The returned array is new. The input is left as it was.

### `participantsMatch(left, right)`

Return `true` when both sides name the same non-empty participant set.

Each side may be a participant array or a chat object. Arrays are participant lists. A bare object is a chat, and the ids come from its `participants` field. `{ id: "ada" }` is a chat with no participants, so it matches nothing.

Order, duplicates, and a blank id do not change the set. A set of one participant can match. An empty set matches nothing, including another empty set. Comparison is case-sensitive. `"Ada"` and `"ada"` are different participants.

### `toTimeMs(value)`

Return epoch milliseconds, or `null` when the value is not a usable time.

| Input            | Result                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------ |
| number           | The number when it is finite and greater than or equal to `MIN_TIME_MS`. Otherwise `null`. |
| `Date`           | `getTime()` under the same rule. An invalid `Date` is `null`.                              |
| decimal string   | Parsed as milliseconds, under the same rule. `"1700000000000"` is that many milliseconds.  |
| date-time string | An instant, when the text matches the form below.                                          |
| anything else    | `null`.                                                                                    |

The date-time form is `YYYY-MM-DD`, then `T`, `t`, or a space, then `HH:mm:ss`, then an optional fraction of one to three digits, then `Z`, `z`, or `±HH:mm`.

`2026-09-30T20:30:00.000Z` and `2026-09-30 20:30:00.000Z` are the same instant. `2026-09-30T20:30:00.5Z` is `2026-09-30T20:30:00.500Z`. A positive offset moves the instant earlier: `2026-09-30T20:30:00.000+01:00` is `2026-09-30T19:30:00.000Z`.

The calendar date must exist. `2026-02-31` is `null`. Hour `24`, minute `60`, and second `60` are `null`. A missing timezone is `null`, so the result does not depend on the machine's local zone. Four fractional digits are `null`.

### `chatActivityScore(chat)`

Return the activity score of one chat, or `null` when the chat has no usable time.

The return value is a frozen object `{ band, timeMs }`. Each call returns a new object.

The checks run in this order. The first match wins.

1. `chat` is `null`, an array, or not an object: `null`.
2. `lastMessageAt` is a usable time: `{ band: ActivityBand.Message, timeMs }` for that time. `updatedAt`, `updated`, `createdAt`, and `created` are not consulted.
3. The latest usable value among `RECORD_TIME_FIELDS`: `{ band: ActivityBand.Record, timeMs }` for that latest value.
4. Otherwise: `null`.

A usable time is whatever `toTimeMs` accepts. A zero, a negative number, and an unparseable string are skipped. A `lastMessageAt` of `0` falls through to the record fields.

The score does not read any other field. A `messages` array on the chat is ignored, including when a message inside it is newer than `lastMessageAt`. Callers who want message activity copy that time onto `lastMessageAt` before scoring. Scanning the messages to find that time made opening a chat unusable, so this module never does it.

`participants` and `id` do not affect the score.

### `pickBestMatchingChat(chats, participants)`

Return the best chat in `chats` whose participant set equals `participants`, or `null` when none match.

| Argument       | Type            | Role                                                                           |
| -------------- | --------------- | ------------------------------------------------------------------------------ |
| `chats`        | array           | Chat objects.                                                                  |
| `participants` | array or object | A participant list, or one chat object whose `participants` field is the list. |

The checks run in this order.

1. `chats` is not an array: throw `TypeError` with message `chats must be an array`.
2. The requested participant set is shorter than `MIN_PARTICIPANT_COUNT`: `null`.
3. Skip entries that are not chat objects.
4. Skip chats whose participant set differs. An extra participant is a different conversation.
5. Among the matches, the higher activity score wins. `ActivityBand.Message` beats `ActivityBand.Record`. The same band uses the later `timeMs`. A score of `null` loses to any score.
6. Equal scores use the normalized chat `id`, ascending. A missing id loses to any id.
7. A remaining tie keeps the earlier chat in `chats`.

The return value is the same object that was in `chats`. It is not a copy. The array is not reordered.

Passing a chat as `participants` selects the best duplicate of that chat, which may be the chat itself.

### `mergeMessageLites(primary, secondary)`

Merge two message pages.

| Argument    | Type            | Role                                                                                |
| ----------- | --------------- | ----------------------------------------------------------------------------------- |
| `primary`   | array or `null` | The page whose copy of an id wins. `null` is an empty page.                         |
| `secondary` | array or `null` | The page that fills in ids the primary page does not have. `null` is an empty page. |

Any other value throws `TypeError`. The message is `primary must be an array or null` or `secondary must be an array or null`. `primary` is checked first.

The result is a new array.

1. Walk `primary`, then `secondary`.
2. Skip values that are not objects.
3. Skip a message whose `id` does not normalize.
4. The first remaining message for an id is kept. Later copies are dropped whole. Their timestamps do not replace the first copy's timestamps.
5. Sort the kept messages by time, ascending. The time is the first usable value among `MESSAGE_TIME_FIELDS`: `createdAt`, then `sentAt`, then `created`. A missing time sorts after every present time.
6. Equal times, including two missing times, break by normalized id, ascending, in UTF-16 code unit order. `"10"` sorts before `"2"`.

The objects in the result are the input objects. Text and other fields are not read. Fold more than two pages by calling the function again. The left-hand page still wins each id, and the sort is applied to the combined page.

## Design notes

Opening a chat used to scan messages to decide which duplicate was current. That scan made the open path unusable. The score now uses timestamps the caller already keeps on the chat. The module reads `lastMessageAt` first, then `updatedAt`, `updated`, `createdAt`, and `created`. Every other field stays unread, including a message list and message text.

The band order is the bias. A conversation that already has `lastMessageAt` stays ahead of a duplicate that was just created, even when the duplicate's `createdAt` is later. A new row with only a created time is the duplicate this function is meant to set aside. A duplicate that itself has a later `lastMessageAt` wins: the rule keeps the conversation that was used most recently, and it sets a new row aside only when that row has no message time. When neither chat has a last message time, the later updated or created time wins, so the newest untouched row is the one you keep. A metadata bump on `updatedAt` does not move a chat that already has `lastMessageAt`. In that band the message time is the whole score.

Participant identity is the set of ids after trimming. Order is irrelevant. One extra person is a different chat. An empty participant list is not an identity, so two empty chats stay separate.

Message pages are merged by id before they are sorted. The first copy wins as a whole object. A later page can add ids. It cannot revise a timestamp, a text field, or any other field of an id that is already present. Sorting then gives the page a single order: oldest first, then smaller id. Callers who want newest-first can reverse the array after the merge.

Ids compare as strings. A non-negative numeric id and the same decimal string are one id. Negative numbers are rejected. Integers that JavaScript cannot represent exactly are rejected, so two nearby values cannot collapse. Case is significant. The library does not apply Unicode normalization.

Times are epoch milliseconds, or a date-time with an explicit offset. The functions do not read `Date.now()`. A timestamp in the future is a normal time and can win. A zero is missing, so a placeholder `0` does not outrank a real row and does not count as message activity.

This module does not open sockets, read storage, or know who the participants are. Names, accounts, and message text stay with the caller. The caller chooses which chats to pass in and which timestamps to copy onto them.

## License

Released under the MIT License. The full text is in [LICENSE](LICENSE).
