# Jack-Preprocess for AI Dungeon

## Key Features

`JackPreprocess` is a preprocessor for AI Dungeon context scripts.

The main purpose of the preprocessor is to allow conditionally hiding portions of Plot Essentials, Story Cards and Author's note -text from the AI. This helps to create stories where the
plot components are dynamically revealed, or even changed. Note that when story has progressed
AI becomes insensitive for elements put in Plot Essentials and Story Cards. Mechanisms for giving
strong guidance to AI are also provided.

It works like a simplified C preprocessor and lets you:
* Conditional inclusion of story text (#if, #elif, #else, #endif, #ifdef, #ifndef)
* Guide AI story progression (#next "what should happen")
* Add extra info directly the story output (#output)
* Define, update, and remove variables dynamically (#define, #set, #undef)
* Inline arithmetic and expression evaluation (+, -, *, /, ())
* Varible substition to text {VARIABLE_NAME} syntax
* Debug logging with #debug
* Using pre-defined marcros to create random events and probabilities, P(10%) and RND()

All the features described above are included in the reduced **Lite** version (`library_lite.js`).
**Full** version (`library.js`) contains more features like possibility to ask questions from AI
to get information on what is happening in the story.

Features only available in the **Full Version** are listed in *cursive*. These include:
 * Asking story status from the AI (#ask, #asking)
 * Support C-style commenting that are not shown to the AI (//, /*, */)

Order of processing:
1. Plot Essentials
2. Triggered Story Cards (World Lore)
4. Author’s Note

WARNING: Remember to have `#endif` after conditional blocks. Not having it at end of Plot Essentials may cause entire content to be excluded including user input.

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
| Variable    | Description                                                                 |
|-------------|-----------------------------------------------------------------------------|
| TURN        | Starts at 0, increments each turn.                                          |
| NEXT        | Appended as `[AI guidance for continuation: ...]`.                          |
| TURNNXT     | Used internally by `#next (delay)` to clear expired guidance.               |
| DEBUG       | Holds debug messages, cleared each turn.                                    |
| OUTPUT      | Holds last output to player                                                 |
| INPUT       | Holds user input from the same turn                                         |
| *COOLDOWN*  | Number of turns before AI can be queried again, default is 10.              |

### Variable evaluation


```
Mary is {MARY_AGE} years old.
```

Use curly brackets {} to reference variable values ({variable_name}). This makes preprocessor
to evaluate the variable value.

### Local variables via namespaces
```
#namespace StoryCardX
#define MARY_AGE 24
Mary is {local:MARY_AGE} years old.
```
Preprocessor does not support true local variables but it provides namespace definitions in order
to allow using same code in multiple story cards just by defining different namespace.

WARNING: If using #namespace it needs to be set on every plot component as the previous namespace may
bleed to the next components.

### #define / #set

```
#define VARIABLE_NAME value
#set VARIABLE_NAME value
```

Defines new *VARIABLE_NAME* (or updates existing) with given *value* or *{expression}*.
*value* can be plain text, or enclosed inside either " or ' characters.

Example:

```
#define A 3
#define SUM {A} + 2
#define ANSWER "SUM: A + 2 = {SUM}"
```

### #undef

```
#undef VARIABLE_NAME
```

Removes a previously defined variable.

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

### `#output [operation] text [delimiter/pattern]`

The `#output` directive queues an output modification command that is applied during text post-processing for the AI generated output. It supports three arguments:

1. **cmd** – operation to perform (`prepend`, `append`, `clear`, `replace`, `swap`, `remove`).
2. **text** – primary string or pattern used by the operation.
3. **delimiter** – optional string placed before and after the text when applicable.

If giving only one argument then cmd defaults to `prepend` and only text argument gets applied.

Multiple `#output` directives can be stacked. The output processing is done on the same order
than the directives are.

(!) TODO: Add support for flushing previous commands.
(!) TODO: Argument order for replace is not logical and is to be changed on the next release.

NOTE: Full version will add the prepended output also to the context (Recent Story) that is sent
to the AI so that AI generates smooth continuation. Lite version does not do such smart look-ahead.

Operations:

* `prepend {text} {delimiter}` → Inserts `{delimiter}{text}{delimiter}` at the start of the output.
* `append {text} {delimiter}` → Inserts `{delimiter}{text}{delimiter}` at the end of the output.
* `replace {pattern} {text}` → Replaces all matches of `{pattern}` with `{text}`. Regex syntax `/pattern/flags` is supported. If capturing groups are present, only the first group is replaced by `{text}`.
* `swap {from} {to}` → Replaces all `{from}` substrings with `{to}`.
* `remove {text}` → Deletes all occurrences of `{text}`.
* `clear` → Clears the entire output.

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
#namespace global
#define A 5
#namespace ns_name1
#define A 15
// {A} == 5
// {local:A} == 15
```
Defines namespace enabling local variables which must use format `{local:COUNT}` or `{L:COUNT}`
when evaluating them. This allows copying same code to multiple locations with separated namespace.

NAMESPACE is sticky and bleeds over to next StoryCards. Thus if you use #namespace be sure to define it separately on every code area.

---

## *3. Commenting*

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

Commented lines are not processed and they are not visible for the AI.

NOTE: Comments are not supported by the Lite version. Any extra characters in front of
a #-directive will cause directive not to be evaluated. (But AI will see it!)

---

## 4. Story control

### #next / *#scene*

```
#next text
#next (delay) text
```

Schedules text to appear on the next turn. Optional *delay* sets how many turns the
guidance is visible to the AI. Any new #next directive will overwrite the previous.

```
#scene text
```

Persistent addition to the story context. Unlike `#next`, it is cleared automatically.
Any new #scene text will overwrite the previous.

NOTE: Scene-text is added after Author's note but before front memory.

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

Every **VARIABLE** you want to update will take one slot on the asking queue, and only 1 of them is served every 10 turns so use carefully!

Hint: Performing regular expression search or matching on **OUTPUT**-variable is another possibility.

WARNING: Avoid over using these primitives. By default the Preprocessor will ask only one question every 10 turns. Each variable will take one slot in the queue.

**type** is expected answer: `bool`, `int`, `string`, `name`, or `none`
  * `bool` → AI must answer yes/no → stored as `1` or `0`
  * `int` → AI must return a single integer
  * `name` → AI must return a name (expect first capital letters)
  * `string` → AI must return a plain string
  * `none` → treated like `bool`, but defines the variable only if answer is positive

WARNING: These are not very realiable. Recomend using bool, int, or none mostly.

NOTE: COOLDOWN variable can be set to zero if wanting to force answer immediately.

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

Debug messages are wrapped in `<SYSTEM> … </SYSTEM>` and automatically stripped from the context by `JackPreprocessor()`.

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
```
---
## Features Planned

Note: Some directives are not yet documented here due to their premature-state.

Features:
1. Ability to perform text search/matching to story context (memories, recent story). Now this is possible only via AI questions. However, previous AI output is available in OUTPUT-variable already.
2. Ability to select some directives to run on the output-hook, so that output can better modified.

Robustness:
1. #ask directives need more work to improve robustness.

---
## Credits

My big thanks go to everyone who has helped to propose ideas, develop, test or debug the script
in the great AI Dungeon community, and to my wife!

People contributing to debug and fixing bugs:
**snipercup**

---
## Version Info
* v1.2.x-beta (28.10.2025): First release for Lite version, after major clean-up on Full version. 
* v0.6-alpha   (7.10.2025): Added support for NAMESPACE and "local" variables.

## Known Bugs
1. If there would be multiple system messages the regular expressions fail to remove them. Current solution is to make sure that there is only one.
2. Questions for AI `#ask/#asking` work but robustness is not guaranteed. These need work. Seems like AI model sometimes fails to return anything creating a red popup "Error continuing story.  No text output received.  Modify your input and try again."
---
Please visit Discord/AI Dungeon for more discussion about this script.

