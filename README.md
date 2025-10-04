# Jack-Preprocess for AI Dungeon

## Overview

`JackPreprocess` is a lightweight preprocessor for AI Dungeon context scripts.
It works like a simplified C preprocessor and lets you:

* Define and undefine variables (`#define`, `#undef`)
* Conditionally include/exclude blocks (`#if`, `#ifdef`, `#ifndef`, `#else`, `#endif`)
* Ask questions for AI to be able to do smart setting of variables (`#ask`, `#refresh`)
* Substitute macros (`{KEY}` → value)
* Evaluate simple arithmetic (`#define COUNTER {COUNTER} + 1`)
* Predefines `TURN` that is incremented automatically
* Content of define `WHAT_NEXT` get added after user input
* Uses `COOLDOWN` to track time until next AI question is allowed.

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

---

## Features

### Directives

```
#define KEY VALUE     // define KEY
#undef KEY            // undefine KEY
#ifdef KEY            // true if KEY defined
#ifndef KEY           // true if KEY not defined
#if <expr>            // evaluate condition
#else                 // alternate branches
#endif
#ask KEY "Question?" (type)   // ask AI and store answer
#refresh KEY                  // force re-asking AI question
```

### `#ask`

`#ask` lets you query the AI for information and store the answer in a variable.
The format is:

```
#ask KEY "Question?" (type)
```

* **KEY** → variable name to store the answer
* **Question?** → string sent to the AI
* **type** → expected answer: `bool`, `int`, `string`, or `none`

  * `bool` → AI must answer yes/no → stored as `1` or `0`
  * `int` → AI must return a single integer
  * `string` → AI must return a plain string
  * `none` → treated like `bool`, but defines the variable only if answer is positive

Examples:

```
#ask DANGER "Are there zombies nearby?" (none)
#if DANGER
The survivors prepare for a fight.
#endif

#ask ENEMY_COUNT "How many enemies are in sight?" (int)
There are {ENEMY_COUNT} foes.

#ask LOCATION "Where are we currently located?" (string)
The group is in {LOCATION}.
```

### `#refresh`

`#refresh` clears the ready-state of a previous `#ask`.
This forces the AI to be queried again, even if the variable already has a value.

Example:

```
#ask WEATHER "What is the weather like?" (string)
It is {WEATHER} today.

#refresh WEATHER
#ask WEATHER "Has the weather changed?" (string)
```

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
