# Jack-Preprocess for AI Dungeon

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
| Variable  | Description                                                                 |
|-----------|-----------------------------------------------------------------------------|
| TURN      | Starts at 0, increments each call.                                          |
| NEXT      | Appended as `[AI guidance for continuation: ...]`.                          |
| TURNNXT   | Used internally by `#next (delay)` to clear expired guidance.               |
| DEBUG     | Holds debug messages, cleared each call.                                    |
| COOLDOWN  | Number of turns before AI can be queried again, default is 10.              |
| INPUT     | Holds last user input                                                       |
| OUTPUT    | Holds last output to player                                                 |

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

### `#output {type} {text} {delimiter}`

The `#output` directive queues an output modification command that is applied during text post-processing. It supports three arguments:

1. **type** – operation to perform (`prepend`, `append`, `replace`, `swap`, `remove`, `clear`, `stop`).
2. **text** – primary string or pattern used by the operation.
3. **delimiter** – optional string placed before and after the text when applicable.

Operations:

* `prepend {text} {delimiter}` → Inserts `{delimiter}{text}{delimiter}` at the start of the output.
* `append {text} {delimiter}` → Inserts `{delimiter}{text}{delimiter}` at the end of the output.
* `replace {pattern} {text}` → Replaces all matches of `{pattern}` with `{text}`. Regex syntax `/pattern/flags` is supported. If capturing groups are present, only the first group is replaced by `{text}`.
* `swap {from} {to}` → Replaces all `{from}` substrings with `{to}`.
* `remove {text}` → Deletes all occurrences of `{text}`.
* `clear` → Clears the entire output.
* `stop` → Stops processing any further queued output commands.

Multiple `#output` directives can be stacked. They are executed in the order they were added.

### #debug

```
#debug text
```
Appends *text* (after expanding expressions) into special variable *DEBUG* and debug log.
Debug messages are enabled by default. They can be disabled with `#debug_off` and re-enabled with `#debug_on`.

The difference to #output is that #debug comments are put within SYSTEM message that is never shown to AI.

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

### #namespace

```
#namespace {name of local namespace}
#namespace gobal
```
Defines namespace enabling local variables which must use format `{local:COUNT}` or `{L:COUNT}`.
Not these variables will be different depending on NAMESPACE so code can be copied as it is.

NAMESPACE is sticky and will bleed over to next StoryCards. Thus if you use #namespace be sure to define it separately on every code area.

Note that **#begin** and **#end** directives will reset the NAMESPACE back to global.

---

## 3. Commenting
```
#begin
// Comments are possible only after #begin directive
// #begin will also default namespace back to global.

This will be visible for AI. // Comment here is NOT allowed. This will be visible to AI!

/* This kind of comment is also ok.
   But be sure to put comment signs always first on each line.

   #end directive will stop comment processing.
   This is important as otherwise the comment processing will be applied
   also to Story Summary and even for Recent Story!
*/
#end
```

---

## 4. Story control

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
#next (2) "This direction will be shown for two turns."
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

**type** is expected answer: `bool`, `int`, `string`, `name`, or `none`
  * `bool` → AI must answer yes/no → stored as `1` or `0`
  * `int` → AI must return a single integer
  * `name` → AI must return a name (expect first capital letters)
  * `string` → AI must return a plain string
  * `none` → treated like `bool`, but defines the variable only if answer is positive

WARNING: These are not yet very realiable. Recomend using bool, int, or none mostly.

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

### `#refresh`

`#refresh VARIABLE`

`#refresh` clears the ready-state of a previous `#ask`.
This forces the AI to be queried again, even if the variable already has a value.

## 5. Variables / Expressions / Conditions

### Variable resolution

Variable *value* is referred by putting it into brackets, like {VARIABLE}.
When working with *strings* you can use "-quatation or '-quatation.

Example:

```
#set A 4.5
#set B 5.5
#set SUM {A}+{B}+4
// SUM == "14"
#set D {A}
// D = "4.5"
#set D A
// D == "A"
#set NAME1 Lisa
// NAME1 == "Lisa"
#set NAME2 "Smith"
// NAME2 == "Smith"
#append NAME3 {NAME2}
// NAME3 == "LisaSmith"
```

Local variables are indicated by having `local:` or `L:` prefix. These prefixes has no impact unless a NAMESPACE is declared using `#namespace {name}` directive. The NAMESPACE is sticky, thus it is important that each file will define NAMESPACE or you will use `#begin` and `#end` for indicating the scripted area.

## 6. Built-in Functions

### TOREGEX(text, flags)
Creates a regex literal string from the given text and optional flags.  
Example:  
`TOREGEX("hello.*", "i")` → `/hello.*/i`

---

### REGEX(string, pattern)
Tests whether a string matches a regex pattern.  
- Returns `"1"` if match found, `"0"` otherwise.  
- Captured groups are stored in `M1`, `M2`, `M3`.  
Example:  
`REGEX("abc123", "([a-z]+)([0-9]+)")` → `1` with `M1="abc"`, `M2="123"`

---

### INCLUDES(string, substring)
Checks if a string contains a substring.  
- Returns `"1"` if found, `"0"` if not.  
Example:  
`INCLUDES("foobar", "foo")` → `1`

---

### P(probability)
Returns `"1"` with the given probability, `"0"` otherwise.  
- Supports percentages (`P(15%)`)  
- Decimal fractions (`P(0.15)`)  
- Variables (`P({A})`)  
Example:  
`P(50%)` → `"1"` about half the time.

---

### RND(min, max)
Generates a random integer between `min` and `max` inclusive.  
Example:  
`RND(1,6)` → random number from 1 to 6.

---

### SELECT(N, [A,B,C])
Selects the Nth element from a list.  
- Indexing starts at 1.  
- Returns empty string if index is out of range.  
Example:  
`SELECT(2, [apple, banana, cherry])` → `banana`


## 7. User Input / Debugging

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

Minimalistic examples without debug-features.
But user debug directives `#debug My debug message` works!

### context.js

```js
const modifier = (text) => {

  // C-style Preprosessing of the context
  text = JackPreprocess(text);

  // Optional:
  // Needed only to support #ASK/#ASKING directives
  text = JackAskAiQuestion(text);

  return {text};
};
modifier(text);
```

### output.js

```js
const modifier = (text) => {

  // Needed to support #ASK and #REFRESH directives
  // - AI answer expected on input
  // - Returns sometimes "< click continue >"
  //   but mostly unmodified input text. 
  text = JackCatchAiAnswer(text);

  // Needed for /debug and for #OUTPUT and #DEBUG directives
  text = JackOutputProcess(text);

  // Optional: The content of lastOutput is stored to {OUTPUT}
  //state.lastOutput = text;

  return {text};
};
modifier(text);
```
### input.js

```js
const modifier = (text) => {

  // For supporting /debug -development debugging see src/input.js

  // Optional: Store input to be available in {INPUT}
  state.lastInput = text;

  return {text};
};
modifier(text);
```


---

## Examples

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
## Credits

My big thanks go to everyone who has helped to develop, test or debug the script in the great AI Dungeon community, and to my wife!

People contributing to testing and debug:
**snipercup**

---
## Version Info
* v0.6-alpha (7.10.2025): Added support for NAMESPACE and "local" variables.
* v0.5-alpha (6.10.2025): Fixed problem where system messages were not removed

## Known Bugs
1. If there would be multiple system messages the regular expressions fail to remove them. Current solution is to make sure that there is only one.
2. Questions for AI `#ask/#asking` work but robustness is not guaranteed. These need work. Seems like AI model sometimes fails to return anything creating a red popup "Error continuing story.  No text output received.  Modify your input and try again."
---
Please visit Discord/AI Dungeon for more discussion about this script.

