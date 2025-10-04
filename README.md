# Jack-Preprocess for AI Dungeon

## Overview

`JackPreprocess` is a lightweight preprocessor for AI Dungeon context scripts.
It works like a simplified C preprocessor and lets you:

* Define and undefine variables (`#define`, `#undef`)
* Conditionally include/exclude blocks (`#if`, `#ifdef`, `#ifndef`, `#else`, `#endif`)
* Substitute macros (`{KEY}` → value)
* Evaluate simple arithmetic (`#define COUNTER {COUNTER} + 1`)
* Predefines `TURN` that is incremented automatically
* Content of define `WHAT_NEXT` get added after user input. 

It is intended to run for text in **context-hook**, so it processes everything in the AI context before it is sent to the model:

1. Plot Essentials
2. Triggered Story Cards (World Lore)
3. Author’s Note
4. User Input

WARNING: Remember to have `#endif` after conditional blocks. Not having it at end of Plot Essentials will cause entire content to be excluded including user input.

---

## Installation

1. Copy `library.js` (the preprocessor core) into your AI Dungeon **Library Script**.
2. Replace your **context.js** with the minimalistic version below (or add the `JackPreprocess` line to your own).
3. (Optional) Add `input.js` and `output.js` if you want debug functionality (`/debug` commands, system messages).

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
```

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
// Remove <SYSTEM> messages before sending context to AI
function JackRemoveSystemMsg(text) {
  return text.replace(/<SYSTEM>[\s\S]*?<\/SYSTEM>/g, '').trim();
}

const modifier = (text) => {

  // Optional: Clean out debug messages.
  text = JackRemoveSystemMsg(text);

  // Preprocess context
  text = JackPreprocess(text);

  // Store context
  state.lastContext = text;

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
```

Context sent to AI:

```
Lisa is an adult.
```

---

This setup lets you preprocess your AI Dungeon context, dynamically change variables during play, and inspect hidden state via debug messages.
