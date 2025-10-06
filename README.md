# Jack-Preprocess for AI Dungeon

## Version Info
v0.5-alpha (6.10.2025): Fixed problem where system messages were not removed

## Known Bugs
1. If there would be multiple system messages the regular expressions fail to remove them. Current solution is to make sure that there is only one.
2. Questions for AI #ask/#asking work but robustness is not guaranteed. These need work.

## Key Features

`JackPreprocess` is a preprocessor for AI Dungeon context scripts.

It works like a simplified C preprocessor and lets you:
* Define, update, and remove variables dynamically (#define, #set, #undef, #append)
* Conditional inclusion of text blocks (#if, #elif, #else, #endif, #ifdef, #ifndef)
* Inline arithmetic and expression evaluation (+, -, *, /, ())
* Macro substitution with {KEY} syntax for variables
* Predefined state variables (TURN, NEXT, DEBUG, etc.) updated automatically
* AI-assisted variables via #ask, #asking, #refresh
* Story guidance scheduling with #next, #scene
* Debug logging with #debug
* Extensible macros such as P() and RND()

It is intended to run for text in **context-hook**, so it processes everything in the AI context before it is sent to the model:

1. Plot Essentials
2. Triggered Story Cards (World Lore)
3. Author’s Note

WARNING: Remember to have `#endif` after conditional blocks. Not having it at end of Plot Essentials will cause entire content to be excluded including user input.

---

## Installation

1. Copy `library.js` (the preprocessor core) into your AI Dungeon **Library Script**.
2. Replace your **context.js** with the minimalistic version below (or add the `JackPreprocess`/`JackAskAiQuestion` lines to your own).
3. Replace your **output.js** with the minimalistic version below (or add `JackCatchAiAnswer` line).
4. (Optional) Add full `input.js` and `output.js` from Github if you want debug functionality (`/debug` commands, system messages).
5. (Optional) Store user input to `state.lastInput` and output to `state.lastOutput` to make these available for the preprocessor as INPUT and OUTPUT.
6. (Optional) Fetch any debug messages that are output via `#debug` using JackGetUserDebug().

---

## 1. Variable assignment

### Reserved Variables
TURN → starts at -1, increments each call.
NEXT → appended as [AI guidance for continuation: ...].
TURNNXT → used internally by #next (delay) to clear expired guidance.
DEBUG → holds debug messages, cleared each call.
COOLDOWN → number of turns before AI can be queried again, default 10.

### #define / #set

```
#define VARIABLE_NAME value
```

Defines new *VARIABLE_NAME* (or updates existing) with given *value* or *{expression}*.
*value* can be plain text, or enclosed inside either " or ' characters.

Example:

```
#define A 3
#define SUM {A} + 2
#define ANSWER "SUM: A + 2 = {SUM}"
// ANSWER = "SUM: A + 2 = 5"
```

### #undef

```
#undef VARIABLE_NAME
```

Removes a previously defined variable.

Example:

```
#undef ANSWER
```

### #append

```
#append VARIABLE_NAME text
```

Appends given *text* (or *{expression}*) to the variable’s current value.

Example:

```
#define LOG "Start"
#append LOG ", Step 1"
// LOG = "Start, Step 1"
```

### #debug

```
#debug text
```

Appends *text* (after expanding expressions) into special variable *DEBUG* and debug log.

Example:

```
#debug "Value of A={A}"
```

---

## 2. Conditionals

### #ifdef / #ifndef

```
#ifdef VARIABLE_NAME
  ...
#endif
```

Includes enclosed text only if variable is defined (or not defined for `#ifndef`).

### #if / #elif / #else / #endif

```
#if {expression}
  ...
#elif {expression}
  ...
#else
  ...
#endif
```

Evaluates given expression. Includes enclosed text if condition is true. `#elif` and `#else` provide alternatives.

---

## 3. Story control

### #next / #scene

```
#next text
#next (delay) text
```

Schedules text to appear on the next turn. Optional *delay* sets how many turns later.

```
#scene text
```

Persistent addition to the story context. Unlike `#next`, it is not cleared automatically each turn.

Example:

```
#next (2) "Two turns later this happens."
#scene "Background story always present."
```

---

## 4. AI Interaction

### `#ask` / `#asking`

```
#ask VARIABLE "Question?" (type)
#asking VARIABLE "Question?" (type)
```

Requests the AI to answer a question. Answer is stored in **VARIABLE**.
* With `#ask`, the answer persists once found.
* With `#asking`, the question is repeated until asked again (**COOLDOWN**=10).

**KEY** → variable name to store the answer
**Question?** → string sent to the AI
**type** → expected answer: `bool`, `int`, `string`, or `none`
  * `bool` → AI must answer yes/no → stored as `1` or `0`
  * `int` → AI must return a single integer
  * `string` → AI must return a plain string
  * `none` → treated like `bool`, but defines the variable only if answer is positive

NOTE: COOLDOWN variable can be set to zero if wanting to force answer immediately.

TODO: Rewrite cooldown logic and add directives for better control.

Examples:

```
#ask DANGER "Are there zombies nearby?"
#ifdef DANGER
The survivors prepare for a fight.
#endif

#ask ENEMY_COUNT "How many enemies are in sight?" (int)
There are {ENEMY_COUNT} foes.
```



Examples:

```
#ask DANGER "Are zombies near?" (none)
// Defines DANGER=1 if yes, or nothing if no

#ask COUNT "How many doors are there?" (int)
// COUNT = number

#ask HERO "Who rescued Lisa?" (name)
// HERO = "John"
```

### `#refresh`

`#refresh VARIABLE`

`#refresh` clears the ready-state of a previous `#ask`.
This forces the AI to be queried again, even if the variable already has a value.

---

### Macro Substitution

```
#define NAME Lisa
The hero is {NAME}.
→ "The hero is Lisa."
```

### User Input

* **Story** input is included as written.
* **Say/Do** input is prefixed with `>` (so `#` macros won’t work inside, but `{VAR}` substitution still does).
* Macro replacement is invisible to the user, since it happens in the context.

### Debug

NOTE: Debug requires adding all files. See installation.

* `/debug on` → enable debug
* `/debug off` → disable debug
* `/debug deep` → always output SYSTEM block
* `/debug KEY=42` → set variable
* `/debug KEY=null` → undefine variable

Debug messages are wrapped in `<SYSTEM> … </SYSTEM>` and automatically stripped from the context by `JackRemoveSystemMsg`.

---

## Hook Files

### context.js

```js
const modifier = (text) => {

  // C-style Preprosessing of the context
  text = JackPreprocess(text);

  // Needed to support #ASK and #REFRESH directives
  // which will send questions to AI
  text = JackAskAiQuestion(text);

  return {text};
};
modifier(text);
```

### output.js

```js
const modifier = (text) => {

  // Needed to support #ASK and #REFRESH directives
  text = JackCatchAiAnswer(text);

  return {text};
};
modifier(text);
```

---

## Example

Input (e.g. Plot Essentials):

```
#define NAME Lisa
#define AGE 20
#if AGE >= 18
{NAME} is an adult.
#else
{NAME} is a child.
#endif

#ask THREAT "Is someone following Lisa?" (none)
#if THREAT
Lisa feels a chill as she realizes she is being stalked.
#endif
```

Context sent to AI (assuming AI answered yes):

```
Lisa is an adult.
Lisa feels a chill as she realizes she is being stalked.
```

---

This setup lets you preprocess your AI Dungeon context, dynamically change variables during play, query AI for values via `#ask`, refresh answers with `#refresh`, and inspect hidden state via debug messages.
