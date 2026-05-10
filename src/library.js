// ======================================================
// === JACK
// ======================================================
// === Global variables ===
const VERSION = "v2.0.2-beta";

// Not required by the library
state.lastOutput = state.lastOutput || '';

// Required variables
state.debugOutput = state.debugOutput || '';
state.JackDefsMap = state.JackDefsMap || { TURN: "-1" };
state.JackDefsNamespace = state.JackDefsNamespace || '';

// AI Questions
state.JackAiQuestions = state.JackAiQuestions || {};
state.JackAiQuestionID = state.JackAiQuestionID || "";
state.lastAiAnswer = state.lastAiAnswer || '';

// Default User Input Modifier Texts
const JACK_DO_CRIT_SUCCESS_TEXT = " [This succeeds amazingly]";
const JACK_DO_FAIL_TEXT = " [But this fails miserably]";
const JACK_SAY_CRIT_SUCCESS_TEXT = " [speaking elegantly]";
const JACK_SAY_FAIL_TEXT = " [this sounds annoying]";

// Output processing
state.JackOutputCommands = state.JackOutputCommands || [];

// Comment handling
state.JackRemoveCommentedLines = state.JackRemoveCommentedLines || true;
state.JackInBlockComment = state.JackInBlockComment || false;

// Fix AI Dungeon Bug where AI returns something funny
globalThis.text ??= "";
if (typeof text === "number") text = text.toString();
text = ((typeof text === "string") && text) || "\n";

// === Expected type prompts ===
const JACK_PROMPT_BOOL = "Answer only with '0' for false/no or '1' for true/yes.";
const JACK_PROMPT_INT = "Answer only with a single integer number.";
const JACK_PROMPT_STRING = "Answer only with the exact string, nothing else.";
const JACK_PROMPT_NAME = "Answer only with name, nothing else.";
const CONTINUE_MSG = "\n< Click continue >";

// === Logging helper function  ===
state.verboseLevel = state.verboseLevel || 2;
const LOG_OFF = 0; // All logging disabled
const LOG_ERROR = 1; // Only log user script errors
const LOG_SYS_ERROR = 2; // Log Jack-Preprocessor function errors
const LOG_VERSION = 3; // Version information
const LOG_STORY = 4; // Log story guidance
const LOG_AI = 5; // Log Ai Responses
const LOG_VAR = 6; // Log All Variables
const LOG_CONTEXT = 7; // Log Full context
const LOG_COMMAND = 8; // Log Commands

// ======================================================
// === Jack Preprocessor - Top
// ======================================================
function JackPreprocessor(text) {
  // Initialize Preprocessor
  text = JackPreprocessorInit(text);

  // Log Context that was input
  if (state.verboseLevel >= LOG_CONTEXT) {
    state.debugOutput += "\nCONTEXT_IN:\n============\n" + text + "\n============\n";
  }

  // Split context into their sections
  let context = JackSplitContext(text);

  // Update time tracking variable
  if (!state.JackDefsMap.TIME) state.JackDefsMap.TIME = "unsure";

  if (!info.actionCount || ((info.actionCount % 6) === 4)) {
    const [time, prob] = JackDetectTimeOfDay(context["Recent Story"], 0.45, state.JackDefsMap.TIME);
    state.JackDefsMap.TIME = time;
  }

  if (!info.actionCount || ((info.actionCount % 3) === 2)) {
    JackUpdateCharacterRelations(context["Recent Story"]);
  }

  let protagonist = ["You", "you"];
  if (state.JackDefsMap.NAME) protagonist.push(state.JackDefsMap.NAME);
  const [loc, score] = JackDetectLocation(context["Recent Story"], context["World Lore"]);
  state.JackDefsMap.LOCATION = loc;
  state.JackDefsMap.LOC_SCORE = score;

  // Look for #LZ_text(SC_name)#, and #LZ_begin(SC_name)#...#LZ_end#-blocks
  // Compression-decompression of context from given story cards.
//  context["Plot Essentials"] = lzParser(context["Plot Essentials"])

  // Execute Script card
  const scriptCardTxt = JackGetCardText("JackScriptCard");
  if (scriptCardTxt) JackPreprocessDirectives(scriptCardTxt);

  // Process sections in the specified order if they exist
  const preprocessOrder = ["Plot Essentials", "World Lore", "[Author's note]"];
  for (const section of preprocessOrder) {
    if (context[section]) {
      context[section] = JackPreprocessDirectives(context[section]);
    }
  }
  // Make output prepend visible for AI in advance
  if (state.JackOutputPrepend) {
    if (context["AfterNote"]) {
      context["AfterNote"] += state.JackOutputPrepend;
    } else {
      context["Recent Story"] = (context["Recent Story"] || "") + state.JackOutputPrepend;
    }
  }

  if (state.JackMaxContextSize) { 
    if (context["Recent Story"]) { 
      context["Recent Story"] = JackReduceTextSize(context["Recent Story"], state.JackMaxContextSize);
    } 
  }

  // Add relevant facts to the Author's Note
  if (state.JackFacts) {
    context["[Author's note]"] = (context["[Author's note]"] || "") + "\n" + state.JackFacts;
  }
  if (state.JackScene) {
    //context["[Author's note]"] = (context["[Author's note]"] || "") + "\n" + state.JackScene;
    context["AfterNote"] = "\n[" + state.JackScene + "]\n" + (context["AfterNote"] || "");
  }

  // Next
  if (state.JackProposeSC) {
    const textSC = JackGetCardText(state.JackProposeSC);
    if (!textSC) {
      JackLog(LOG_ERROR, "ERROR: JackProposeSC '" + state.JackProposeSC + "' is empty.");
    } else {
      context["AfterNote"] = textSC + (context["AfterNote"] || "");
    }
    delete state.JackProposeSC;
  }
  if (state.JackDefsMap.hasOwnProperty("NEXT")) {
    let guidance = "\n[" + state.JackDefsMap.NEXT + "]";
    context["AfterNote"] = (context["AfterNote"] || "") + guidance;
    //JackLog(LOG_STORY, guidance);
  }

  // Merge everything back
  text = JackMergeContext(context);

  return text;
}

// ======================================================
// === Directive - Helpers
// ======================================================

// #define / #def / #set
// keyToken: variable name, valRaw: raw string value
function define(keyToken, valRaw) {
  const key = JackResolveKey(String(keyToken || ""));
  const val = stripQuotes(JackEvalValue((valRaw || "").trim()));
  state.JackDefsMap[key] = val;
  JackLog(LOG_COMMAND, key + " <- " + val);
}

// #flag value
// restRaw: the value to set if undefined
function flag(restRaw) {
  const key = stripQuotes(JackEvalValue(String(restRaw || "").trim()));
  if (!state.JackDefsMap[key]) state.JackDefsMap[key] = state.JackDefsMap.TURN;
}

// #append key value
// keyToken: variable name, valRaw: value to append
function append(keyToken, valRaw) {
  const key = JackResolveKey(String(keyToken || ""));
  const val = stripQuotes(JackEvalValue(String(valRaw || "").trim()));
  state.JackDefsMap[key] = (state.JackDefsMap[key] || "") + val;
  JackLog(LOG_COMMAND, key + " appended " + val);
}

// #namespace / #ns
// nsRaw: namespace string
function namespace(nsRaw) {
  let ns = stripQuotes(String(nsRaw || "").trim());
  if (!ns || /^global$/i.test(ns)) ns = "";
  state.JackDefsNamespace = ns;
  JackLog(LOG_COMMAND, "NAMESPACE <- " + ns);
}

// #undef key
// keyRaw: variable name
function undef(keyRaw) {
  const key = JackResolveKey(String(keyRaw || "").split(/\s+/)[0]);
  delete state.JackDefsMap[key];
  JackLog(LOG_COMMAND, key + " <- undefined");
}

// #max_size: n
// valRaw: number
function max_size(valRaw) {
  const val = valRaw ? parseInt(String(valRaw).trim(), 10) : null;
  if (val !== null && !isNaN(val)) state.JackMaxContextSize = val;
  else JackLog(LOG_ERROR, "Unexpected #max_context_size directive.");
}

// #output / #out
// cmdRaw: command, argRaw: argument
function output(cmdRaw, argRaw) {
  let cmd = stripQuotes(String(cmdRaw || ""));
  let arg1 = argRaw ? stripQuotes(JackEvalValue(argRaw)) : "";
  if (cmd && !arg1) { arg1 = cmd; cmd = "prepend"; }
  JackAddOutputCommand(cmd, arg1, "");
  //if (cmd === "prepend") prepends.push(arg1);
  //state.JackOutputPrepend = arg1 + state.JackOutputPrepend;
}

// #ask directive (separate from #asking)
// keyToken: variable name, questionRaw: question, expectRaw: optional, choicesArray: optional
function ask(keyToken, questionRaw, expectRaw, choicesArray) {
  const key = JackResolveKey(String(keyToken || ""));
  const question = JackEvalValue(String(questionRaw || ""));
  let expect = expectRaw ? String(expectRaw).toLowerCase() : null;
  let choices = choicesArray && choicesArray.length ? choicesArray.slice() : null;

  if (!expect) {
    if (/^\s*(is|are|was|were|do|does|did|has|have|had|can|could|will|would|should|may|might|shall|am)\b/i.test(question) || /\bor\b/i.test(question))
      expect = "none";
    else expect = "string";
  }
  if (choices) expect = "string";
  if (!["bool", "int", "string", "none", "name"].includes(expect)) expect = "string";

  if (!(expect === "none" && state.JackDefsMap.hasOwnProperty(key))) {
    JackAddAiQuestion(key, question, expect, choices);
  }
}

// #asking directive (forces .ready=false if key exists)
// keyToken: variable name, questionRaw: question, expectRaw: optional, choicesArray: optional
function asking(keyToken, questionRaw, expectRaw, choicesArray) {
  ask(keyToken, questionRaw, expectRaw, choicesArray);
  const key = JackResolveKey(String(keyToken || ""));
  if (state.JackAiQuestions[key]) state.JackAiQuestions[key].ready = false;
}

// #continue_msg text
function continue_msg(textRaw) {
  const msg = stripQuotes(JackEvalValue(String(textRaw || "").trim()));
  state.continue_msg = "\n" + msg;
  JackLog(LOG_COMMAND, "continue_msg <- " + msg);
}

// #refresh key
function refresh(keyRaw) {
  const key = JackResolveKey(String(keyRaw || "").split(/\s+/)[0]);
  if (state.JackAiQuestions[key]) {
    state.JackAiQuestions[key].ready = false;
    JackLog(LOG_COMMAND, "#REFRESH cleared ready for " + key);
  }
}

// #debug val
function debug(valRaw) {
  if (state.JackDefsMap["DEBUG_OFF"] === undefined) {
    const val = stripQuotes(JackEvalValue(String(valRaw || "").trim()));
    if (!state.JackDefsMap.DEBUG) state.JackDefsMap.DEBUG = "";
    state.JackDefsMap.DEBUG += val + "\n";
  }
}

// #debug_off
function debug_off() { state.JackDefsMap["DEBUG_OFF"] = "Debug disabled"; }
// #debug_on
function debug_on() { delete state.JackDefsMap["DEBUG_OFF"]; }

// #front_memory / #fmem
function front_memory(textRaw) {
  const data = stripQuotes(JackEvalValue(String(textRaw || "").trim()));
  state.memory.frontMemory = data;
  JackLog(LOG_STORY, "state.memory.frontMemory <- " + data);
}

// #next / #nxt
function next(delayRaw, dataRaw) {
  const delay = delayRaw ? parseInt(String(delayRaw), 10) : null;
  const data = stripQuotes(JackEvalValue(String(dataRaw || "")));
  state.JackDefsMap.NEXT = data;
  if (delay !== null && !isNaN(delay)) {
    state.JackDefsMap.TURNXT = String(parseInt(state.JackDefsMap.TURN, 10) + delay);
  }
  JackLog(LOG_STORY, "NEXT <- " + data + (delay !== null ? " with delay " + delay : ""));
}

// #propose
function propose(textRaw) {
  const data = stripQuotes(JackEvalValue(String(textRaw || "").trim()));
  if (!data) {
    delete state.JackProposeSC;
    JackLog(LOG_STORY, "Proposal cleared");
  } else {
    state.JackProposeSC = data;
    JackLog(LOG_STORY, 'Propose <-- StoryCard:"' + data + '"');
  }
}

// #scene
function scene(textRaw) {
  const data = stripQuotes(JackEvalValue(String(textRaw || "").trim()));
  if (!data) {
    delete state.JackScene;
    JackLog(LOG_STORY, "Scene cleared");
  } else {
    state.JackScene = "*** TRANSITION DIRECTIVE (High Priority): Immediately shift the narrative to:\n" + data + "\n***";
    JackLog(LOG_STORY, 'Scene <-- "' + data + '"');
  }
}

// #fact
function fact(textRaw) {
  let data = "- " + stripQuotes(JackEvalValue(String(textRaw || "").trim())) + "\n";
  if (!state.JackFacts) {
    state.JackFacts = "\nRelevant facts:\n" + data;
    JackLog(LOG_STORY, "\nFact added:\n" + data);
  } else if (!state.JackFacts.includes(data)) {
    state.JackFacts += data;
    JackLog(LOG_STORY, "\nFact added:\n" + data);
  }
}

// #set_location
function set_location(locRaw) {
  state.JackDefsMap.LOCATION = stripQuotes(String(locRaw || "").trim());
  JackLog(LOG_COMMAND, "LOCATION <- " + state.JackDefsMap.LOCATION);
}

// #set_name
function set_name(nameRaw) {
  state.JackDefsMap.NAME = stripQuotes(String(nameRaw || "").trim());
  JackLog(LOG_COMMAND, "Protagonist Name <- " + state.JackDefsMap.NAME);
}

// #set_time
function set_time(timeRaw) {
  state.JackDefsMap.TIME = stripQuotes(String(timeRaw || "").trim());
  JackLog(LOG_COMMAND, "TIME <- " + state.JackDefsMap.TIME);
}

// #user_success rate [text]
function user_success(rateRaw, textRaw) {
  state.JackDoCritSuccessRate = stripQuotes(JackEvalValue(String(rateRaw || "")));
  state.JackDoCritSuccessText = textRaw ? textRaw : JACK_DO_CRIT_SUCCESS_TEXT;
  JackLog(LOG_COMMAND, "DO CRIT SUCCESS rate=" + state.JackDoCritSuccessRate + " text=" + (textRaw || "(unchanged)"));
}

// #user_fail rate [text]
function user_fail(rateRaw, textRaw) {
  state.JackDoFailRate = stripQuotes(JackEvalValue(String(rateRaw || "")));
  state.JackDoFailText = textRaw ? textRaw : JACK_DO_FAIL_TEXT;
  JackLog(LOG_COMMAND, "DO FAIL rate=" + state.JackDoFailRate + " text=" + (textRaw || "(unchanged)"));
}

// #user_trusted rate [text]
function user_trusted(rateRaw, textRaw) {
  state.JackSayCritSuccessRate = stripQuotes(JackEvalValue(String(rateRaw || "")));
  state.JackSayCritSuccessText = textRaw ? textRaw : JACK_SAY_CRIT_SUCCESS_TEXT;
  JackLog(LOG_COMMAND, "SAY CRIT SUCCESS rate=" + state.JackSayCritSuccessRate + " text=" + (textRaw || "(unchanged)"));
}

// #user_suspicious / #user_sus rate [text]
function user_suspicious(rateRaw, textRaw) {
  state.JackSayFailRate = stripQuotes(JackEvalValue(String(rateRaw || "")));
  state.JackSayFailText = textRaw ? textRaw : JACK_SAY_FAIL_TEXT;
  JackLog(LOG_COMMAND, "SAY FAIL rate=" + state.JackSayFailRate + " text=" + (textRaw || "(unchanged)"));
}

// ======================================================
// === Jack Preprocessor Core
// ======================================================
function removeSystemTags(input) {
  let prev;
  let result = input;
  const regex = /<SYSTEM>(?:[^<]*|<(?!\/?SYSTEM>))*?<\/SYSTEM>/gs;
  // Repeat until no more nested pairs remain
  do {
    prev = result;
    result = result.replace(regex, '');
  } while (result !== prev);  
  return result;
}

// === Initialization ===
function JackPreprocessorInit(text) {

  // Remove any SYSTEM-messages
  text = removeSystemTags(text);
  text = text.replace(CONTINUE_MSG, '');

  // Reset Variables
  state.debugOutput = "";

  // Delete Variables
  if (state.JackDefsMap.DEBUG) delete state.JackDefsMap.DEBUG;
  if (state.JackFacts) delete state.JackFacts;
  if (state.JackOutputPrepend) delete state.JackOutputPrepend;
  if (state.JackGuidance) delete state.JackGuidance;

  // Capture last user input
  if (state.lastInput) {
    state.JackDefsMap.USER_INPUT = state.lastInput;
  }
  //state.JackDefsMap.ACTION = history.type;
  //state.JackDefsMap.ACTION_TXT = history.text;

  // Capture last output
  if (state.lastOutput) {
    state.JackDefsMap.LAST_OUTPUT = state.lastOutput;
  }

  // TURN increment
  let cur = parseInt(state.JackDefsMap.TURN, 10);
  if (isNaN(cur)) cur = -1;
  state.JackDefsMap.TURN = String(cur + 1);

  // WAIT decrement
  if (!state.JackDefsMap.WAIT)
    state.JackDefsMap.WAIT = String(0);
  else {
    let wait = parseInt(state.JackDefsMap.WAIT, 10);
    if (isNaN(wait) || wait<=0) {
      state.JackDefsMap.WAIT = String(0);
    } else {
      state.JackDefsMap.WAIT = String(wait - 1);
    }
  }

  // check NEXT expiration
  if (state.JackDefsMap.TURNXT && parseInt(state.JackDefsMap.TURN, 10) >= parseInt(state.JackDefsMap.TURNXT, 10)) {
    delete state.JackDefsMap.NEXT;
    delete state.JackDefsMap.TURNXT;
  }
  return text;
}

// === Preprocess context text ===
function JackPreprocessDirectives(text) {

  let facts = "";
  let empty_line = true;
  let prepends = [];

  state.JackDefsNamespace = "";
  state.JackInBlockComment = false;

  // Java block support
  let inJavaBlock = false;
  let java_block_code = "";
  const _jack_protect_vars = [];
  const _jack_protect_name = "_jack_protect_vars_987654321";

  text = stripAuthorsNote(text);
  const lines = (text || "").split(/\r?\n/);
  const out = [];
  const active = [true];
  const branchTaken = [];

  for (let line of lines) {

    let rawLine = line;
    let t = line.trim();

    // Handle lines inside java block
    if (inJavaBlock && !t.startsWith("#java_end")) {
      java_block_code += rawLine + "\n";
      continue;
    }

    // Handle comments if enabled
    if (state.JackRemoveCommentedLines) {
      t = JackStripComments(t);
    }

    // Handle empty lines
    if (!t) {
      if (!empty_line) {
        empty_line = true;
        out.push("");
      }
      continue;
    }

    // Handle non-command context
    if (!t.startsWith("#")) {
      if (active[active.length - 1]) {
        out.push(JackEvalValue(rawLine));
        empty_line = false;
      }
      continue;
    }

    // Process #-commands
    const [directiveRaw, ...restArr] = t.split(/\s+/);
    const directive = (directiveRaw || "").toLowerCase();
    const rest = restArr.join(" ").trim();
    const parent = active[active.length - 1];

    switch (directive) {
      case "#gender":
      case "#":
        break;
      case "#def":
      case "#define":
      case "#set": {
        if (!parent) break;
        const m = rest.match(/^([A-Za-z0-9_:.]+)(?:\s+(.*))?$/s);
        if (m) define(m[1], m[2] || "1");
        else JackLog(LOG_ERROR, "Invalid #define/#set format: " + rawLine);
        break;
      }
      case "#flag":
        if (!parent) break;
        flag(rest);
        break;
      case "#app":
      case "#append": {
        if (!parent) break;
        const m = rest.match(/^([A-Za-z0-9_]+)\s+(.*)$/s);
        if (m) append(m[1], m[2]);
        else JackLog(LOG_ERROR, "Invalid #append format: " + rawLine);
        break;
      }
      case "#ns":
      case "#namespace":
        if (!parent) break;
        namespace(rest);
        break;
      case "#undef":
        if (!parent) break;
        if (!rest) {
          JackLog(LOG_ERROR, "Missing argument for #undef: " + rawLine);
          break;
        }
        undef(rest);
        break;
      case "#ifdef": {
        const key = JackResolveKey(rest.split(/\s+/)[0]);
        //const cond = parent && state.JackDefsMap.hasOwnProperty(key);
        const cond = parent && JackVarDefined(key);
        active.push(cond);
        branchTaken.push(cond);
        break;
      }
      case "#if_user_input": {
        if (!rest) {
          const cond = parent && state.JackDefsMap.USER_INPUT;
          active.push(cond);
          branchTaken.push(cond);
        } else {
          if (rest.match(/^\s*\/*.\/[dgimsuvy]?[dgimsuvy]?\s*$/i)) {
            const cond = parent && JackCheckCondition("REGEX(" + rest + ",{USER_INPUT})");
            active.push(cond);
            branchTaken.push(cond);
          } else {
            const cond = parent && JackCheckCondition("INCLUDES(" + rest + ",{USER_INPUT})");
            active.push(cond);
            branchTaken.push(cond);
          }
        }
        break;
      }
      case "#ifndef": {
        const key = JackResolveKey(rest.split(/\s+/)[0]);
        //const cond = parent && !state.JackDefsMap.hasOwnProperty(key);
        const cond = parent && !JackVarDefined(key);
        active.push(cond);
        branchTaken.push(cond);
        break;
      }
      case "#if": {
        const cond = parent && JackCheckCondition(rest);
        active.push(cond);
        branchTaken.push(cond);
        break;
      }
      case "#else_if":
      case "#elif": {
        if (active.length > 1) {
          const prev = active.pop();
          const prevTaken = branchTaken.pop();
          const prevParent = active[active.length - 1];
          const cond = prevParent && !prevTaken && JackCheckCondition(rest);
          active.push(cond);
          branchTaken.push(prevTaken || cond);
        } else {
          JackLog(LOG_ERROR, "Unexpected #elif without matching #if: " + rawLine);
        }
        break;
      }
      case "#else": {
        if (active.length > 1) {
          const prev = active.pop();
          const prevTaken = branchTaken.pop();
          const prevParent = active[active.length - 1];
          const cond = prevParent && !prevTaken;
          active.push(cond);
          branchTaken.push(prevTaken || cond);
        } else {
          JackLog(LOG_ERROR, "Unexpected #else without matching #if: " + rawLine);
        }
        break;
      }
      case "#end":
      case "#endif": {
        if (active.length > 1) {
          active.pop();
          branchTaken.pop();
        } else {
          JackLog(LOG_ERROR, "Unexpected #endif without matching #if: " + rawLine);
        }
        break;
      }
      case "#max_size:":
        if (!parent) break;
        max_size(rest);
        break;
      case "#out":
      case "#output": {
        if (!parent) break;
        const m = rest.match(/^("[^"]+"|'[^']+'|\S+)(?:\s+("[^"]+"|'[^']+'|\S+))?/);
        if (m) {
          //output(m[1], m[2] || "");
          let cmd = stripQuotes(String(m[1] || ""));
          let arg1 = m[2] ? stripQuotes(JackEvalValue(m[2])) : "";
          if (cmd && !arg1) { arg1 = cmd; cmd = "prepend"; }
          JackAddOutputCommand(cmd, arg1, "");
          if (cmd === "prepend") prepends.push(arg1);
        }
        else JackLog(LOG_ERROR, "Invalid #OUTPUT format: " + rawLine);
        break;
      }
      case "#msg":
      case "#message": {
        if (!parent) break;
        if (rest) {
          state.message = stripQuotes(rest);
        }
        break;
      }
      // -------------- NEW directive handlers: #array, #add, #remove --------------
      case "#array": {
        if (!parent) break;
        // rest contains "<array_name> <item1>, <item2>, ..."
        const m = rest.match(/^([A-Za-z0-9_:.]+)(?:\s+(.*))?$/s);
        if (m) {
          const key = JackResolveKey(m[1]);
          const itemsRaw = (m[2] || "").trim();
          // Split by commas at top-level, trim whitespace, strip surrounding quotes
          const items = itemsRaw === "" ? [] : itemsRaw.split(/\s*,\s*/).map(x => {
            const v = x.trim();
            // remove surrounding quotes if present
            if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) return v.slice(1, -1);
            return v;
          });
          // store as array in map (note: existing map may hold strings; arrays are allowed)
          state.JackDefsMap[key] = items;
          JackLog(LOG_COMMAND, `${key} <- [${items.join(", ")}]`);
        } else JackLog(LOG_ERROR, "Invalid #array format: " + rawLine);
        break;
      }
      case "#add": {
        if (!parent) break;
        // rest: "<array_name> <item1>, <item2>, ..."
        const m = rest.match(/^([A-Za-z0-9_:.]+)(?:\s+(.*))?$/s);
        if (m) {
          const key = JackResolveKey(m[1]);
          const itemsRaw = (m[2] || "").trim();
          const itemsToAdd = itemsRaw === "" ? [] : itemsRaw.split(/\s*,\s*/).map(x => {
            const v = x.trim();
            if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) return v.slice(1, -1);
            return v;
          });
          if (!state.JackDefsMap.hasOwnProperty(key) || !Array.isArray(state.JackDefsMap[key])) {
            // create new array if not existing or not an array
            state.JackDefsMap[key] = [];
          }
          // append items
          state.JackDefsMap[key] = state.JackDefsMap[key].concat(itemsToAdd);
          JackLog(LOG_COMMAND, `${key} +<- ${itemsToAdd.join(", ")}`);
        } else JackLog(LOG_ERROR, "Invalid #add format: " + rawLine);
        break;
      }
      case "#remove": {
        if (!parent) break;
        // rest: "<array_name> <item1>, <item2>, ..."
        const m = rest.match(/^([A-Za-z0-9_:.]+)(?:\s+(.*))?$/s);
        if (m) {
          const key = JackResolveKey(m[1]);
          const itemsRaw = (m[2] || "").trim();
          const itemsToRemove = itemsRaw === "" ? [] : itemsRaw.split(/\s*,\s*/).map(x => {
            const v = x.trim();
            if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) return v.slice(1, -1);
            return v;
          });
          if (!state.JackDefsMap.hasOwnProperty(key) || !Array.isArray(state.JackDefsMap[key])) {
            // nothing to remove
            JackLog(LOG_COMMAND, `${key} (no-op remove)`);
          } else {
            // Use stripQuotes(...).trim() for normalization
            const normalizedRemove = itemsToRemove.map(x => String(stripQuotes(x)).trim());
            state.JackDefsMap[key] = state.JackDefsMap[key].filter(item => {
              const normItem = String(stripQuotes(item)).trim();
              return normalizedRemove.indexOf(normItem) === -1;
            });
            JackLog(LOG_COMMAND, `${key} -<- ${itemsToRemove.join(", ")}`);
          }
        } else JackLog(LOG_ERROR, "Invalid #remove format: " + rawLine);
        break;
      }
      // -------------- AI Questions: #ask, #asking, #refresh -----------
      case "#ask": {
        if (!parent) break;
        const m = rest.match(/^([A-Za-z0-9_]+)\s+"([^"]+)"(?:\s+\(([^)]+)\))?/);
        if (!m) {
          JackLog(LOG_ERROR, "Invalid #ASK format: " + rawLine);
          break;
        }
        let choices = null;
        const cm = rest.match(/list=\[([^\]]+)\]/i);
        if (cm) choices = cm[1].split(/\s*,\s*/);

        ask(m[1], m[2], m[3], choices);
        break;
      }
      case "#asking": {
        if (!parent) break;
        const m = rest.match(/^([A-Za-z0-9_]+)\s+"([^"]+)"(?:\s+\(([^)]+)\))?/);
        if (!m) {
          JackLog(LOG_ERROR, "Invalid #ASK format: " + rawLine);
          break;
        }
        let choices = null;
        const cm = rest.match(/list=\[([^\]]+)\]/i);
        if (cm) choices = cm[1].split(/\s*,\s*/);

        asking(m[1], m[2], m[3], choices);
        break;
      }
      case "#continue_msg":
        if (!parent) break;
        continue_msg(rest);
        break;
      case "#refresh":
        if (!parent) break;
        refresh(rest);
        break;
      // -------------- Debug/comment directives --------------
      case "#dbg":
      case "#debug":
        if (!parent) break;
        debug(rest);
        break;
      case "#debug_off":
        if (!parent) break;
        debug_off();
        break;
      case "#debug_on":
        if (!parent) break;
        debug_on();
        break;
      case "#comment_on":
        state.JackRemoveCommentedLines = true;
        break;
      case "#comment_off":
        state.JackRemoveCommentedLines = false;
        break;
      // -------------- Story control directives --------------
      case "#fmem":
      case "#front_memory":
        if (!parent) break;
        front_memory(rest);
        break;
      case "#nxt":
      case "#next": {
        if (!parent) break;
        const m = rest.match(/^(?:\(?\s*(\d+)\s*\)?\s+)?(.*)$/s);
        if (!m) {
          JackLog(LOG_ERROR, "Invalid #next format: " + rawLine);
          break;
        }
        if (!m[2] || !m[2].trim()) {
          JackLog(LOG_ERROR, "Missing argument for #next: " + rawLine);
          break;
        }
        next(m[1], m[2]);
        break;
      }
      case "#propose":
        if (!parent) break;
        propose(rest);
        break;
      case "#scene":
        if (!parent) break;
        scene(rest);
        break;
      case "#fact":
        if (!parent) break;
        fact(rest);
        break;
      case "#set_location":
        if (!parent) break;
        set_location(rest);
        break;
      case "#set_name":
        if (!parent) break;
        set_name(rest);
        break;
      case "#set_time":
        if (!parent) break;
        set_time(rest);
        break;
      case "#verbose":
        if (!parent) break;
        if (!isNaN(rest) && rest.trim() !== "") {
          state.verboseLevel = Number(rest);
        }
        break;        
      case "#user_success": {
        const m = rest.match(/^(\S+)(?:\s+(.*))?$/s);
        if (m) user_success(m[1], m[2] || "");
        else JackLog(LOG_ERROR, "Invalid #user_success format: " + rawLine);
        break;
      }
      case "#user_fail": {
        const m = rest.match(/^(\S+)(?:\s+(.*))?$/s);
        if (m) user_fail(m[1], m[2] || "");
        else JackLog(LOG_ERROR, "Invalid #user_fail format: " + rawLine);
        break;
      }
      case "#user_trusted": {
        const m = rest.match(/^(\S+)(?:\s+(.*))?$/s);
        if (m) user_trusted(m[1], m[2] || "");
        else JackLog(LOG_ERROR, "Invalid #user_trusted format: " + rawLine);
        break;
      }
      case "#user_suspicious": {
        const m = rest.match(/^(\S+)(?:\s+(.*))?$/s);
        if (m) user_suspicious(m[1], m[2] || "");
        else JackLog(LOG_ERROR, "Invalid #user_suspicious format: " + rawLine);
        break;
      }
      // -------------- In-line java support --------------
      case "#java_begin":
      case "#java_start": {
        if (!parent) break;
        inJavaBlock = true;
        java_block_code = "";
        JackLog(LOG_COMMAND, "Java block started");
        break;
      }
      case "#java_end": {
        if (!inJavaBlock) break;
        inJavaBlock = false;

        if (java_block_code.includes(_jack_protect_name)) {
          JackLog(LOG_ERROR, "Java block rejected: protected variable name detected");
          break;
        }
        try {
          // Store protected vars (text intentionally not protected)
          _jack_protect_vars.push({
            lines: [...lines],
            active: [...active],
            prepends: [...prepends],
            out: [...out],
            java_block_code
          });
          // Merge current out into text so java block can modify it
          text = out.join("\n");
          // Replace {CAPS} with state.JackDefsMap.CAPS
          let processed_code = java_block_code.replace(/\{([A-Z_]+)\}/g, (m, p1) => `state.JackDefsMap.${p1}`);

          JackLog(LOG_COMMAND, "Executing Java block...");
          eval(processed_code);

          // After execution, restore modified text into out
          out.length = 0;
          out.push(text);
        } catch (err) {
          JackLog(LOG_ERROR, "Error executing Java block: " + err.message);
        } finally {
          // Restore protected vars
          const last = _jack_protect_vars.pop();
          if (last) {
            lines.length = 0;
            lines.push(...last.lines);
            active.length = 0;
            active.push(...last.active);
            prepends.length = 0;
            prepends.push(...last.prepends);
          }
        }
        JackLog(LOG_COMMAND, "Java block executed");
        break;
      }
      // -------------- End-of-directives --------------
      default: {
        JackLog(LOG_ERROR, "Unknown directive: " + directive + " " + rest);
        break;
      }
    }
  }

  // Insert prepended text
  if (prepends.length) {
    const prependBlock = prepends.join("");
    if (!state.JackOutputPrepend) state.JackOutputPrepend = "";
    state.JackOutputPrepend = prependBlock + state.JackOutputPrepend;
  }

  // Combine output text
  text = out.join("\n");
  //text = out.join("\n").trim().replace(/\n{3,}/g, "\n\n");

  return text;
}

function JackStripComments(t) {
  // Handle if currently inside a block comment
  if (state.JackInBlockComment) {
    const end = t.indexOf("*/");
    if (end !== -1) {
      t = t.slice(end + 2).trimStart();
      state.JackInBlockComment = false;
    } else {
      return "";
    }
  }

  // Skip full-line // comments
  if (/^\s*\/\//.test(t)) return "";

  // Strip inline // after #
  if (/^\s*#/.test(t)) t = t.replace(/\/\/.*$/, "").trimEnd();

  // Handle block comment starts or inline blocks
  const start = t.indexOf("/*");
  if (start !== -1) {
    const end = t.indexOf("*/", start + 2);
    if (end === -1) {
      t = t.slice(0, start).trimEnd();
      state.JackInBlockComment = true;
    } else {
      t = (t.slice(0, start) + t.slice(end + 2)).trim();
    }
  }

  return t.trim();
}

// === Remove Quotes - Helper ===
function stripQuotes(s) {
  if (typeof s !== 'string') return s;
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
}
function stripAuthorsNote(s) {
  if (typeof s !== 'string') return s;
  if (s.startsWith("[Author's note:") && s.endsWith("]")) {
    // Slice from the colon index + 1, then trim the resulting message
    return s.slice(s.indexOf(":") + 1, -1).trim();
  }
  return s;
}

// === Array to string - Helper ===
function JackFormatArrayForDisplay(arr) {
  if (!Array.isArray(arr)) return String(arr);
  const items = arr.map(x => String(x));
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return items[0] + " and " + items[1];
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}

// === Resolve Key (namespace) ===
function JackResolveKey(key) {
  if (!key) return key;
  let up = key.toUpperCase();
  if (up.startsWith("L:")) {
    return state.JackDefsNamespace + "_" + key.slice(2);
  }
  if (up.startsWith("LOCAL:")) {
    return state.JackDefsNamespace + "_" + key.slice(6);
  }
  return key;
}

function JackVarDefined(key) {
  if (!state.JackDefsMap.hasOwnProperty(key)) return false;
  const v = state.JackDefsMap[key];
  if (v === "" || v === "0" || v === "NaN") return false;
  return true;
}

// === Macro substitution and special { ... } evaluation ===
function JackApplyMacros(text) {
  text = String(text);

  let changed;
  do {
    changed = false;
    text = text.replace(/\{([^{}]+)\}/g, (m, inner) => {
      inner = inner.trim();
      let expanded = JackApplyMacros(inner);

      // Variable lookup
      if (/^[A-Za-z0-9_:.]+$/.test(expanded)) {
        let key = JackResolveKey(expanded);
        if (state.JackDefsMap.hasOwnProperty(key)) {
          const v = state.JackDefsMap[key];
          changed = true;
          if (Array.isArray(v)) {
            // Format array into display string "a, b and c" and allow further macro expansion
            return JackApplyMacros(String(JackFormatArrayForDisplay(v)));
          }
          return JackApplyMacros(String(v));
        }
        // Undefined key - defaults to "0"
        changed = true;
        return "0";
      }

      // Evaluate special functions
      try {
        let val = JackEvalSpecial(expanded);
        if (val !== expanded) {
          changed = true;
          return val;
        }
      } catch (e) {}

      // Expression evaluation
      try {
        let expr = expanded.replace(/\b([A-Za-z_][A-Za-z0-9_:.]*)\b/g, (k) => {
          if (state.JackDefsMap.hasOwnProperty(k)) {
            let v = state.JackDefsMap[k];
            // numeric literal
            if (/^-?\d+(\.\d+)?$/.test(v)) return v;
            // already quoted string
            if (/^(['"]).*\1$/.test(v)) return v;
            // empty string
            if (v === "") return '""';
            // generic string literal
            return JSON.stringify(String(v));
          }
          // unresolved → leave as quoted name
          return JSON.stringify(k);
        });

        let r = eval(expr);
        if (typeof r === "number" && !isNaN(r)) {
          changed = true;
          return String(r);
        }
        if (typeof r === "string") {
          changed = true;
          return r;
        }
      } catch (e) {}

      return expanded;
    });
  } while (changed);

  return text;
}

// === Condition evaluation ===
function JackCheckCondition(expr) {
  try {
    expr = JackApplyMacros(expr);

    // Evaluate special functions first
    expr = expr.replace(/\b(REGEX|INCLUDES|P|RND|SELECT)\s*\([^)]*\)/g, (m) => JackEvalSpecial(m));

    // Temporarily protect quoted strings so subsequent transforms don't touch them
    const quoted = [];
    expr = expr.replace(/"[^"]*"|'[^']*'/g, (m) => {
      quoted.push(m);
      return `__Q${quoted.length - 1}__`;
    });

    // Convert standalone and/or (case-insensitive) to JS logical operators (only outside protected quotes)
    expr = expr.replace(/\b(and|or)\b/gi, (m) => {
      return m.toLowerCase() === 'and' ? '&&' : '||';
    });

    // Convert {anything} into a single quoted string "{anything}" (using JSON.stringify to escape safely)
    // This runs before bare-identifier quoting so the content inside braces is not quoted as a separate identifier.
    expr = expr.replace(/\{([^}]+)\}/g, (m, p1) => {
      return JSON.stringify('{' + p1 + '}');
    });

    // Quote bare identifiers safely (skipping protected quoted tokens)
    expr = expr.replace(/\b([A-Za-z_][A-Za-z0-9_:.]*)\b/g, (m) => {
      // leave JS primitives and reserved words as-is
      if (["true","false","null","undefined"].includes(m)) return m;
      if (/^(if|else|return|typeof|new|var|let|const|for|while|do|switch|case|break|continue|function)$/.test(m)) return m;
      if (/^[0-9]/.test(m)) return m;
      // don't re-quote placeholders like __Q0__ (they are not identifiers to be quoted)
      if (/^__Q\d+__$/.test(m)) return m;
      return JSON.stringify(m);
    });

    // Restore protected quoted strings
    expr = expr.replace(/__Q(\d+)__/g, (_, i) => quoted[i]);

    return !!eval(JackFixIncompleteComparisons(expr));
  } catch (e) {
    JackLog(LOG_ERROR, "Cond error: " + e.message + " in '" + expr + "'");
    return false;
  }
}

function JackFixIncompleteComparisons(expr) {
  expr = expr.trim();

  if (/^(===|!==|==|!=|>=|<=|>|<)/.test(expr)) expr = "null " + expr;
  if (/(===|!==|==|!=|>=|<=|>|<)$/.test(expr)) expr += " null";

  // Fix accidental double quotes like ""text"" → "text"
  expr = expr.replace(/""([^"]+)""/g, '"$1"');

  // Fix incomplete comparisons missing a right-hand operand
  expr = expr.replace(/(===|!==|==|!=|>=|<=|>|<)\s*(?=(&&|\|\||$))/g, '$1 null');

  // Fix incomplete comparisons missing a left-hand operand
  expr = expr.replace(/(^|&&|\|\|)\s*(===|!==|==|!=|>=|<=|>|<)/g, '$1 null $2');

  return expr;
}

// === Evaluate value ===
function JackEvalValue(val) {
  let expanded = JackApplyMacros(val).trim();
  try {
    if (/^[0-9+\-*/().\s]+$/.test(expanded)) {
      let res = eval(expanded);
      if (typeof res === "number" && !isNaN(res)) return String(res);
    }
  } catch (e) { }
  return expanded;
}

// === Get DEBUG value ===
function JackGetUserDebug() {
  if (state.JackDefsMap.DEBUG)
    return state.JackDefsMap.DEBUG;
  else
    return "";
}

// ======================================================
// === Story Card Manipulation
// ======================================================

// Relationship symbols
const relationshipSymbols = [
    "😡😡😡😡","😡😡😡🌑","😡😡🌑🌑","😡🌑🌑🌑","😐🌑🌑🌑","😃🌑🌑🌑",
    "😃😃🌑🌑","😃😃😃🌑","😃😃😃😃","❤️🌑🌑🌑","❤️❤️🌑🌑","❤️❤️❤️🌑","❤️❤️❤️❤️"
  ];
  
  function JackGetCardState(title, symbols) {
    if (typeof title !== "string" || !Array.isArray(symbols) || symbols.length === 0) return -1;
    var t = title.replace(/^\s+/, "");
    for (var i = 0; i < symbols.length; i++) {
      var s = symbols[i];
      if (t.includes(s)) return i;
    }
    return -1;
  }
  
  function getTitle(title, symbols, index) {
    if (typeof title !== "string" || !Array.isArray(symbols)) return title;
    if (index < 0) index = 0;
    if (index > symbols.length) index = symbols.length - 1;
    var t = title.replace(/^\s+/, "");
    var sym = symbols[index];
    for (var i = 0; i < symbols.length; i++) {
      var s = symbols[i];
      if (t.indexOf(s + " ") === 0) return sym + " " + t.slice((s + " ").length);
      if (t.indexOf(s) === 0) {
        var rest = t.slice(s.length);
        if (rest.charAt(0) === " ") rest = rest.slice(1);
        return sym + (rest ? " " + rest : "");
      }
    }
    return sym + (t ? " " + t : "");
  }
  
function getPlainTitle(title, symbols)
{
    if (typeof title !== "string" || !Array.isArray(symbols)) return title;
    var t = title;
    for (var i = 0; i < symbols.length; i++) {
        var s = symbols[i];
        if (t.includes(s)) {
            t = t.replace(s, "");
            break; // remove only one symbol
        }
    }
    return t.replace(/\s+/g, " ").trim();
}

  
// ======================================================
// === Story Card Management Functions
// ======================================================

  /**
   * buildCard/getCard-function code used under MIT License
   * Copyright (c) 2025 Xilmanaath and LewdLeah
   */
  
  /**
   * Creates a new story card and inserts it into storyCards. Thanks LewdLeah!
   * 
   * @param {string} title - The card title.
   * @param {string} entry - The card entry content.
   * @param {string} type - The card type (e.g., "chronometer").
   * @param {string} keys - Comma-separated trigger keywords.
   * @param {string} description - The card's description/config block.
   * @param {number} insertionIndex - Index to insert the card at (0 = top).
   * @returns {object} A reference to the newly created or updated card.
   */
  function JackBuildCard(
          title,
          entry = "",
          type = "character",
          keys = title,
          description = "",
          insertionIndex = 0)
  {
      if (![type, title, keys, entry, description].every(arg => (
              typeof arg === "string"))) {
          throw new Error(
              "buildCard must be called with strings for title, entry, type, keys, and description"
          );
      } else if (!Number.isInteger(insertionIndex)) {
          throw new Error(
              "buildCard must be called with an integer for insertionIndex"
          );
      } else {
          insertionIndex = Math.min(Math.max(0, insertionIndex),
              storyCards.length);
      }
      addStoryCard("%@%");
      for (const [index, card] of storyCards.entries()) {
          if (card.title !== "%@%") {
              continue;
          }
          card.type = type;
          card.title = title;
          card.keys = keys;
          card.entry = entry;
          card.description = description;
          if (index !== insertionIndex) {
              // Remove from the current position and reinsert at the desired index
              storyCards.splice(index, 1);
              storyCards.splice(insertionIndex, 0, card);
          }
          return Object.seal(card);
      }
      throw new Error(
          "An unexpected error occurred with buildCard");
  }
  
  /**
   * Searches storyCards for cards matching a given predicate. Thanks LewdLeah!
   *
   * @param {function} predicate - A function that evaluates each card (c => c.title === "Epoch").
   * @returns {object|object[]|null} The matching card(s), or null if none found.
   */
  function JackGetCard(predicate)
  {
      if (typeof predicate !== "function") {
          throw new Error(
              "Invalid argument: \"" + predicate +
              "\" -> getCard must be called with a function"
          );
      }
      // Return a reference to the first card which satisfies the given condition
      for (const card of storyCards) {
          if (predicate(card)) {
              return Object.seal(card);
          }
      }
      return null;
  }
  
  /**
   * Searches storyCards for cards matching a given predicate. Thanks LewdLeah!
   *
   * @param {function} predicate - A function that evaluates each card (c => c.title === "Epoch").
   * @returns {object|object[]|null} The matching card(s), or null if none found.
   */
  function JackGetAllCards(predicate)
  {
      if (typeof predicate !== "function") {
          throw new Error(
              "Invalid argument: \"" + predicate +
              "\" -> getAllCards must be called with a function"
          );
      } else {
          // Return an array of card references which satisfy the given condition
          const collectedCards = [];
          for (const card of storyCards) {
              if (predicate(card)) {
                  Object.seal(card);
                  collectedCards.push(card);
              }
          }
          return collectedCards;
      }
      return null;
  }

/**
 * Removes all story cards matching a given predicate.
 *
 * @param {function} predicate - A function that evaluates each card (c => c.title === "Epoch").
 * @returns {number} The number of cards removed.
 */
function JackRemoveCards(predicate)
{
    if (typeof predicate !== "function") {
        throw new Error(
            "Invalid argument: \"" + predicate +
            "\" -> JackRemoveCards must be called with a function"
        );
    }
    let removedCount = 0;
    // Iterate backwards to safely splice while removing multiple items
    for (let i = storyCards.length - 1; i >= 0; i--) {
        if (predicate(storyCards[i])) {
            storyCards.splice(i, 1);
            removedCount++;
        }
    }
    return removedCount;
}

/**
 * Removes the first story card whose title contains the given title string.
 *
 * @param {string} title - Substring to match against the card title.
 * @returns {boolean} true if a card was removed, false otherwise.
 */
function JackRemoveCardWithTitle(title) {
  if (typeof title !== "string" || !title) return false;

  for (const [index, card] of storyCards.entries()) {
    if (typeof card.title !== "string") continue;
    if (!card.title.includes(title)) continue;

    removeStoryCard(index);
    return true;
  }

  return false;
}

/**
 * Removes the first story card whose title exactly matches the given title
 * and returns it.
 *
 * @param {string} title - The exact title of the card to remove.
 * @returns {object|null} The removed card, or null if no matching card was found.
 */
function JackGetCardWithTitle(title) {
  if (typeof title !== "string") {
    JackLog(LOG_ERROR, "JackGetCardText: title must be string");
    return null;
  }

  for (const card of storyCards) {
    if (card.title.includes(title)) {
      return Object.seal(card);
    }
  }
  //JackLog(LOG_ERROR, "JackGetCardTextWithTitle: Card '" + title + "' not found.");
  return null;
}

function JackGetCardText(title) {
  const card = JackGetCardWithTitle(title);
  if (card) {
    return card.entry;
  } else {
    return "";
  }
}

/**
 * Creates a new story card and inserts it into storyCards. Thanks LewdLeah!
 * 
 * @param {string} title - The card title.
 * @param {string} entry - The card entry content.
 * @param {string} type - The card type (e.g., "chronometer").
 * @param {string} keys - Comma-separated trigger keywords.
 * @param {string} description - The card's description/config block.
 * @returns {object} A reference to the newly created or updated card.
 */
function JackSaveCard(
    title,
    entry = "",
    type = "",
    keys = "",
    description = "")
{
  if (![type, title, keys, entry, description].every(arg => (
          typeof arg === "string"))) {
      throw new Error(
          "saveCard must be called with strings for title, entry, type, keys, and description"
      );
  } else if (!Number.isInteger(insertionIndex)) {
      throw new Error(
          "saveCard must be called with an integer for insertionIndex"
      );
  } else {
      insertionIndex = Math.min(Math.max(0, insertionIndex),
          storyCards.length);
  }
  
  for (let i = 0; i < storyCards.length; i++) {
    var card = storyCards[i];
    if (card.title.includes(title)) {
        if (type) card.type = type;
        if (keys) card.keys = keys;
        if (entry) card.entry = entry;
        if (description) card.description = description;
        storyCards[i] = Object.seal(card);
        return Object.seal(card);
    }
  }
  
  // Card didn't exist. Create it.
  addStoryCard("%@%");
  for (const [index, card] of storyCards.entries()) {
      if (card.title !== "%@%") {
          continue;
      }
      card.type = type;
      card.title = title;
      card.keys = keys;
      card.entry = entry;
      card.description = description;
      return Object.seal(card);
  }
  throw new Error(
      "An unexpected error occurred with saveCard");
}

function JackGetCardFullTitle(title) {
    if (typeof title !== "string") {
      JackLog(LOG_ERROR, "JackGetCardFullTitle: title must be string");
      return "";
    }
  
    try {
      const card = JackGetCard(c =>
        typeof c.title === "string" && c.title.indexOf(title) !== -1
      );
  
      if (!card) {
        JackLog(LOG_ERROR, "JackGetCardFullTitle: card not found for title: " + title);
        return "";
      }
  
      return card.title;
    } catch (e) {
      JackLog(LOG_ERROR, "JackGetCardFullTitle failed for title: " + title);
      return "";
    }
}
  
function JackUpdateCardTitle(title, new_title) {
    if (typeof title !== "string" || typeof new_title !== "string") {
      JackLog(LOG_ERROR, "JackUpdateCardTitle: title and new_title must be strings");
      return;
    }
  
    try {
      const card = JackGetCard(c =>
        typeof c.title === "string" && c.title.indexOf(title) !== -1
      );
  
      if (!card) {
        JackLog(LOG_ERROR, "JackUpdateCardTitle: card not found for title: " + title);
        return;
      }
  
      JackBuildCard(
        new_title,                // updated title
        card.entry || "",          // keep entry
        card.type,                // keep type
        card.keys,                // keep keys
        card.description || "",   // keep description
        storyCards.indexOf(card)  // keep position
      );
    } catch (e) {
      JackLog(LOG_ERROR, "JackUpdateCardTitle failed for title: " + title);
    }
}  


// ======================================================
// === Functions to compress/uncompress text
// ======================================================
// LZ-based compress/decompress (UTF-16 safe, lossless).
const LZUTF16 = (function(){
  // --- ADDED: local base64 helpers (no browser dependency) ---
  function toBase64(str) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let output = "";
    let i = 0;
    while (i < str.length) {
      const c1 = str.charCodeAt(i++) & 0xff;
      const c2 = str.charCodeAt(i++);
      const c3 = str.charCodeAt(i++);
      const e1 = c1 >> 2;
      const e2 = ((c1 & 3) << 4) | (c2 >> 4);
      const e3 = isNaN(c2) ? 64 : ((c2 & 15) << 2) | (c3 >> 6);
      const e4 = isNaN(c3) ? 64 : (c3 & 63);
      output += chars.charAt(e1) + chars.charAt(e2)
        + (e3 === 64 ? "=" : chars.charAt(e3))
        + (e4 === 64 ? "=" : chars.charAt(e4));
    }
    return output;
  }

  function fromBase64(input) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let str = "";
    input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");
    let i = 0;
    while (i < input.length) {
      const e1 = chars.indexOf(input.charAt(i++));
      const e2 = chars.indexOf(input.charAt(i++));
      const e3 = chars.indexOf(input.charAt(i++));
      const e4 = chars.indexOf(input.charAt(i++));
      const c1 = (e1 << 2) | (e2 >> 4);
      const c2 = ((e2 & 15) << 4) | (e3 >> 2);
      const c3 = ((e3 & 3) << 6) | e4;
      str += String.fromCharCode(c1);
      if (e3 !== 64 && e3 !== -1) str += String.fromCharCode(c2);
      if (e4 !== 64 && e4 !== -1) str += String.fromCharCode(c3);
    }
    return str;
  }
  // --- END ADDED ---

  function _compress(uncompressed) {
    if (uncompressed == null) return "";
    const dictionary = new Map();
    const data = [];
    let dictSize = 3;
    let w = "";
    const outputChar = (v) => {
      data.push(String.fromCharCode(v));
    };

    for (let i = 0; i < uncompressed.length; i++) {
      const c = uncompressed.charAt(i);
      const wc = w + c;
      if (dictionary.has(wc)) {
        w = wc;
      } else {
        const code = (w === "") ? uncompressed.charCodeAt(i) : dictionary.get(w);
        outputChar(code);
        dictionary.set(wc, dictSize++);
        w = c;
      }
    }

    if (w !== "") {
      const code = dictionary.has(w) ? dictionary.get(w) : w.charCodeAt(0);
      outputChar(code);
    }

    // --- MODIFIED: safe Base64 encoding ---
    const uint16 = new Uint16Array(data.map(ch => ch.charCodeAt(0)));
    let binary = "";
    for (let i = 0; i < uint16.length; i++) {
      binary += String.fromCharCode(uint16[i]);
    }
    return "LZ:" + toBase64(binary);
    // --- END MODIFIED ---
  }

  function _decompress(compressed) {
    if (compressed == null || compressed.length === 0) return "";

    // --- MODIFIED: safe Base64 decoding ---
    if (!compressed.startsWith("LZ:")) return compressed;
    const binary = fromBase64(compressed.slice(3));
    const data = new Uint16Array(binary.length);
    for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
    // --- END MODIFIED ---

    const dictionary = [];
    let dictSize = 3;

    if (data.length === 0) return "";

    let w = String.fromCharCode(data[0]);
    let result = w;
    let entry;
    for (let k = 1; k < data.length; k++) {
      const code = data[k];
      if (dictionary[code]) {
        entry = dictionary[code];
      } else if (code === dictSize) {
        entry = w + w.charAt(0);
      } else {
        throw new Error("Bad compressed code: " + code);
      }
      result += entry;
      dictionary[dictSize++] = w + entry.charAt(0);
      w = entry;
    }
    return result;
  }

  function compress(input) {
    if (input == null) return "";
    return _compress(input);
  }

  function decompress(input) {
    if (input == null) return "";
    return _decompress(input);
  }

  return { compress, decompress };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = LZUTF16;
}

// === Compression helpers (Unicode-safe, lossless) ===
function TOLZ(text) {
  if (!text) return "";
  return LZUTF16.compress(text);
}

function LZ(compressed) {
  if (!compressed) return "";
  return LZUTF16.decompress(compressed);
}
// ======================================================
// Store data in Story Card with compression

// Saves text into a story card with given name.
// Always overwrites existing card data or creates new one if missing.
// Keys = ["JackText"], type = "Data".
function saveTextToSC(card_name, text) {
  text = TOLZ(text);
  /*const card = {
    name: card_name,
    keys: ["JackText"],
    entry: text,
    type: "Data",
    title: card_name,
    description: "",
    category: "Data"
  };*/
  return JackSaveCard(card_name, text);
}

// Returns text content from a story card saved by saveTextToSC().
// Returns "" if card doesn't exist.
function getLzTextFromSC(card_name) {
  const card = JackGetCardText(card_name);
  return card ? LZ(card.entry) : "";
}

// ======================================================
// === Built-in Functions
// ======================================================

// === Helper: evaluate special functions used in conditions or { ... } sequences ===
function JackEvalSpecial(token) {
  token = token.trim();

  // TOLZ(text)
  let m = token.match(/^TOLZ\s*\((.+)\)$/i);
  if (m) {
    let txt = JackApplyMacros(m[1].trim());
    return TOLZ(txt);
  }

  // LZ(compressed)
  m = token.match(/^LZ\s*\((.+)\)$/i);
  if (m) {
    let txt = JackApplyMacros(m[1].trim());
    return LZ(txt);
  }

  // TOREGEX(text, flags)
  m = token.match(/^TOREGEX\s*\(([^,]+)(?:,\s*([^)]+))?\)$/i);
  if (m) {
    let txt = stripQuotes(JackApplyMacros(m[1].trim()));
    let flg = m[2] ? stripQuotes(JackApplyMacros(m[2].trim())) : "";
    return "/" + txt + "/" + flg;
  }

  // REGEX(string, pattern)
  m = token.match(/^REGEX\s*\(([^,]+),\s*(.+)\)$/i);
  if (m) {
    let str = stripQuotes(JackApplyMacros(m[1].trim()));
    let patternRaw = stripQuotes(JackApplyMacros(m[2].trim()));
    try {
      let re = new RegExp(patternRaw);
      let match = str.match(re);
      if (match) {
        state.JackDefsMap.M1 = match[1] || "";
        state.JackDefsMap.M2 = match[2] || "";
        state.JackDefsMap.M3 = match[3] || "";
        return "1";
      } else {
        state.JackDefsMap.M1 = state.JackDefsMap.M2 = state.JackDefsMap.M3 = "";
        return "0";
      }
    } catch (e) {
      state.debugOutput += "REGEX error: " + e.message + "\n";
      return "0";
    }
  }

  // INCLUDES(stringOrArrayRef, substring)
  m = token.match(/^INCLUDES\s*\(([^,]+),\s*(.+)\)$/i);
  if (m) {
    const rawFirst = m[1].trim();
    const rawSecond = m[2].trim();

    // Try to detect if the first argument is a simple variable name referencing an array
    if (/^[A-Za-z0-9_:.]+$/.test(rawFirst)) {
      const key = JackResolveKey(rawFirst);
      if (state.JackDefsMap.hasOwnProperty(key) && Array.isArray(state.JackDefsMap[key])) {
        // array membership check (exact match, case-sensitive after trimming quotes/whitespace)
        const needle = String(stripQuotes(JackApplyMacros(rawSecond))).trim();
        const found = state.JackDefsMap[key].some(it => String(stripQuotes(it)).trim() === needle);
        return found ? "1" : "0";
      }
    }
    // fallback: treat first argument as string (previous behavior)
    let str = stripQuotes(JackApplyMacros(rawFirst));
    let sub = stripQuotes(JackApplyMacros(rawSecond));
    return str.indexOf(sub) !== -1 ? "1" : "0";
  }

  // MAX(a,b,c,...)
  m = token.match(/^MAX\s*\(([^)]+)\)$/i);
  if (m) {
    let parts = m[1].split(",").map(v => parseFloat(JackApplyMacros(v.trim())));
    if (parts.some(isNaN)) return "NaN";
    return String(Math.max(...parts));
  }

  // MIN(a,b,c,...)
  m = token.match(/^MIN\s*\(([^)]+)\)$/i);
  if (m) {
    let parts = m[1].split(",").map(v => parseFloat(JackApplyMacros(v.trim())));
    if (parts.some(isNaN)) return "NaN";
    return String(Math.min(...parts));
  }

  // AVG(a,b,c,...)
  m = token.match(/^AVG\s*\(([^)]+)\)$/i);
  if (m) {
    let parts = m[1].split(",").map(v => parseFloat(JackApplyMacros(v.trim())));
    if (parts.some(isNaN)) return "NaN";
    let avg = parts.reduce((a, b) => a + b, 0) / parts.length;
    return String(avg);
  }  

  // P(15%) or P(0.15) or P({A})
  m = token.match(/^P\s*\(([^)]+)\)$/i);
  if (m) {
    let arg = JackApplyMacros(m[1].trim());
    arg = stripQuotes(arg);
    if (/^(\d+)%$/.test(arg)) {
      let pct = parseInt(RegExp.$1, 10);
      return (Math.random() * 100 < pct) ? "1" : "0";
    }
    let num = parseFloat(arg);
    if (!isNaN(num)) {
      return (Math.random() < num) ? "1" : "0";
    }
    return "0";
  }

  // RND(min,max)
  m = token.match(/^RND\s*\(([^,]+),\s*([^)]+)\)$/i);
  if (m) {
    let a = parseInt(JackApplyMacros(m[1].trim()), 10);
    let b = parseInt(JackApplyMacros(m[2].trim()), 10);
    if (isNaN(a) || isNaN(b)) return "";
    if (a > b) { let t = a; a = b; b = t; }
    return String(Math.floor(Math.random() * (b - a + 1)) + a);
  }

  // SELECT(N,[A,B,C])
  m = token.match(/^SELECT\s*\(([^,]+),\s*\[(.*)\]\)$/i);
  if (!m) m = token.match(/^SELECT\s*\(([^,]+),\s*(.*)\)$/i);
  if (m) {
    let idxRaw = JackApplyMacros(m[1].trim());
    let idx = parseInt(idxRaw, 10);
    if (isNaN(idx)) return "";

    let listSource = m[2].trim();

    let list = [];

    // Case A: explicit bracketed list was used (first regex branch already captured items inside [])
    if (/^\[.*\]$/.test("[" + listSource + "]") && m[2] !== undefined && token.match(/\[.*\]/)) {
      // split by commas at top-level
      list = listSource.split(/,\s*/).map(x => stripQuotes(JackApplyMacros(x.trim())));
    } else if (/^[A-Za-z0-9_:.]+$/.test(listSource)) {
      // Case B: second arg is a variable name; check if it's an array
      const key = JackResolveKey(listSource);
      if (state.JackDefsMap.hasOwnProperty(key) && Array.isArray(state.JackDefsMap[key])) {
        list = state.JackDefsMap[key].map(x => String(x));
      } else {
        // variable exists but not an array -> evaluate to string then split by commas
        let evald = JackApplyMacros(listSource);
        evald = stripQuotes(evald).trim();
        list = evald === "" ? [] : evald.split(/\s*,\s*/).map(x => stripQuotes(x.trim()));
      }
    } else {
      // Case C: evaluated expression or string representing comma-separated list
      let evald = JackApplyMacros(listSource);
      evald = stripQuotes(evald).trim();
      list = evald === "" ? [] : evald.split(/\s*,\s*/).map(x => stripQuotes(x.trim()));
    }

    if (list.length === 0) return "";
    if (idx < 1 || idx > list.length) return "";
    return list[idx - 1];
  }

  // simple numeric/string fallback
  return token;
}

// ======================================================
// === AI asking (#ask/#asking/#refresh)
// ======================================================

// === Cooldown stored inside JackDefsMap.COOLDOWN ===
function JackGetCooldown() {
  let v = parseInt(state.JackDefsMap.COOLDOWN, 10);
  if (isNaN(v)) v = 0;
  return v;
}
function JackSetCooldown(n) {
  state.JackDefsMap.COOLDOWN = String(Math.max(0, Math.floor(n)));
}

// === Add or update a question ===
function JackAddAiQuestion(ID, question, expect, choices) {
  if (!state.JackAiQuestions[ID]) {
    state.JackAiQuestions[ID] = {
      question: question,
      expect: expect,
      answer: "",
      ready: false,
      choices: "",
    };
  } else {
    state.JackAiQuestions[ID].question = question;
    state.JackAiQuestions[ID].expect = expect;
    state.JackAiQuestions[ID].ready = false;
  }
  if (choices) {
    state.JackAiQuestions[ID].choices = "[" + choices.join(",") + "]";
  }
}

// === Ask pending question if available ===
function JackAskAiQuestion(text) {
  let cooldown = JackGetCooldown();
  if (cooldown > 0) {
    JackSetCooldown(cooldown - 1);
    return text;
  }

  for (let ID in state.JackAiQuestions) {
    let q = state.JackAiQuestions[ID];
    if (!q.ready) {
      state.JackAiQuestionID = ID;
      JackSetCooldown(10);

      let prompt = "";
      if (q.expect === "bool" || q.expect === "none") prompt = JACK_PROMPT_BOOL;
      else if (q.expect === "int") prompt = JACK_PROMPT_INT;
      else if (q.expect === "name") prompt = JACK_PROMPT_NAME;
      else if (q.choices) prompt = "Answer only with one of: " + q.choices;
      else prompt = JACK_PROMPT_STRING;

      text += `\n<SYSTEM>Ignore all previous instructions and answer only the following question clearly and simply: ${q.question}. ${prompt}</SYSTEM>\n`;
      state.lastAiAnswer = "";
      return text;
    }
  }
  return text;
}

// === Helper: check if text after answer is valid story ===
function JackIsValidStoryText(txt) {
  let t = txt.trim();
  if (t.length < 100) return false;
  if (/[(){}[\]/#&=><]/.test(t)) return false;
  if (!/^[A-Z][a-z]/.test(t)) return false;
  if (!/[.!?]$/.test(t)) return false;
  return true;
}

function JackThereIsActiveAiQuestion() {
  if (state.JackAiQuestionID)
    return true;
  else
    return false
}

// === Catch and process answer ===
function JackCatchAiAnswer(text) {
  if (!state.JackAiQuestionID) {
    // No active question, just pass through the story text
    return text;
  }
  let ID = state.JackAiQuestionID;

  // Clear immediately so question won't be re-processed
  state.JackAiQuestionID = "";

  if (state.JackAiQuestions[ID]) {
    let q = state.JackAiQuestions[ID];
    let ans = String(text || "").trim();
    state.lastAiAnswer = ans;
    let valid = false;
    let parsed = "";

    if (q.expect === "bool" || q.expect === "none") {
      let hasTrue = /\b(yes|true|1)\b/i.test(ans);
      let hasFalse = /\b(no|false|0)\b/i.test(ans);
      if (hasTrue && !hasFalse) { parsed = "1"; valid = true; }
      else if (hasFalse && !hasTrue) { parsed = "0"; valid = true; }
    } else if (q.expect === "int") {
      let matches = ans.match(/[-+]?\d+/g);
      if (matches && matches.length === 1) { parsed = matches[0]; valid = true; }
    } else if (q.expect === "string") {
      let cleaned = ans.replace(/<[^>]*>/g, "").trim();
      if (cleaned.length > 0) { parsed = cleaned; valid = true; }
    } else if (q.expect === "name") {
      let cleaned = ans.trim();
      if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?$/.test(cleaned)) { parsed = cleaned; valid = true; }
    }

    if (q.choices) {
      let choices = q.choices.slice(1, -1).split(",").map(s => s.trim());
      if (choices.includes(ans) || choices.includes(parsed)) { parsed = ans; valid = true; }
    }

    if (valid) {
      q.answer = parsed;
      q.ready = true;
      if (q.expect === "none") {
        if (!state.JackDefsMap.hasOwnProperty(ID) && parsed === "1") state.JackDefsMap[ID] = "1";
      } else {
        state.JackDefsMap[ID] = parsed;
      }
      state.debugOutput += ID + " <- " + parsed + " (from AI answer)\n";
    } else {
      state.debugOutput += "Invalid AI answer for ID=" + ID + " (" + q.expect + "): " + ans + "\n";
      // leave q.ready false so it repeats later
    }
  } else {
    state.debugOutput += "JackCatchAiAnswer: no question entry for ID=" + ID + "\n";
  }

  if (state.continue_msg) {
    return state.continue_msg;
  } else {
    return CONTINUE_MSG;
  }
}

// === Get stored answer ===
function JackGetAiAnswer(ID) {
  if (state.JackAiQuestions[ID]) return state.JackAiQuestions[ID].answer;
  return "";
}

// === Dump all AI questions ===
function JackAiQuestionsDump() {
  let out = "JackAiQuestions:\n";
  const cooldown = JackGetCooldown();
  const activeID = state.JackAiQuestionID;
  out += "Cooldown=" + cooldown;
  if (activeID !== undefined && activeID !== "") out += ", ActiveID=" + activeID;
  if (cooldown > 0) out += " (cooling down)";
  out += "\n";
  for (let ID in state.JackAiQuestions) {
    let q = state.JackAiQuestions[ID];
    out += ID + " => { question: \"" + q.question + "\", expect: " + q.expect + ", answer: \"" + q.answer + "\", ready: " + q.ready + " }\n";
    out += "Full Answer:\n" + state.lastAiAnswer + "\n";
  }
  return out;
}

// ======================================================
// === Context Splitting and Merging Helpers
// ======================================================
function JackSplitContext(text) {
  const mainHeaders = ["World Lore", "Story Summary", "Recent Memories", "Memories", "Recent Story"];
  const bracketHeader = "Author's note";
  const result = {};
  let currentHeader = "Plot Essentials";
  result[currentHeader] = "";

  const mainPattern = new RegExp(`^(?:${mainHeaders.join("|")}):\\s*$`, "gm");
  const parts = text.split(mainPattern);
  const headerMatches = [...text.matchAll(mainPattern)].map(m => m[0].replace(":", "").trim());

  for (let i = 0; i < parts.length; i++) {
    const sectionText = parts[i].trim();
    if (sectionText)
      result[currentHeader] = (result[currentHeader] || "") + (result[currentHeader] ? "\n" : "") + sectionText;
    if (headerMatches[i]) {
      currentHeader = headerMatches[i];
      result[currentHeader] = result[currentHeader] || "";
    }
  }
  
  // Scan all sections for Author's Note
  for (const key of Object.keys(result)) {
    let remainder = result[key];

    // Skip non-string sections
    if (typeof remainder !== "string") continue;

    // Use stored author's note text if available
    const storedNote = (typeof state !== "undefined" && state.memory && state.memory.authorsNote)
      ? state.memory.authorsNote.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      : "";

    // Build non-greedy match; no spaces allowed before the colon
    const contentPattern = storedNote ? `[\\s\\S]*?${storedNote}[\\s\\S]*?` : `[\\s\\S]*?`;
    const bracketPattern = new RegExp(`\\[${bracketHeader}:(${contentPattern})\\]`, "m");

    const match = bracketPattern.exec(remainder);
    if (match) {
      const before = remainder.slice(0, match.index);
      result[key] = before.trim(); // CHANGED: use current section key

      const noteContent = match[1].trim();
      result[`[${bracketHeader}]`] = noteContent;

      const after = remainder.slice(match.index + match[0].length);
      if (after.trim()) result["AfterNote"] = after.trim();
      else if (!result["AfterNote"]) result["AfterNote"] = "";
    }
  }
  return result;
}

function JackMergeContext(sections) {
  // Note: Story Summary left out on purpose.
  const mainOrder = ["World Lore", "Recent Memories", "Memories", "Recent Story"];
  const bracketHeaders = ["Author's note", "Guidance", "Scene"];
  let output = "";

  if (sections["Plot Essentials"]?.trim()) output += sections["Plot Essentials"].trim() + "\n";

  for (const header of mainOrder) {
    if (!(header in sections)) continue;

    const body = sections[header] ?? "";
    output += `\n${header}:\n${body.trim()}\n`;

    if (header === "Recent Story") {
      for (const b of bracketHeaders) {
        const key = `[${b}]`;
        if (sections[key]?.trim()) output += `[${b}: ${sections[key].trim()}]\n`;
      }

      if (sections["AfterNote"] !== undefined && sections["AfterNote"] !== null && sections["AfterNote"] !== "") {
        output += sections["AfterNote"];
      }
    }
  }
  return output.trim();
}

function JackReduceTextSize(text, max) {
  if (!text || text.length <= max) return text;

  // Cut only if text exceeds max
  let excess = text.length - max;
  // Search for the first sentence boundary after the excess point
  let re = /[.!?](?=\s|\n)/g;
  let cutPos = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index >= excess) {
      cutPos = match.index + 1; // include punctuation
      break;
    }
  }

  // If no boundary found, cut directly at excess
  if (cutPos === 0) cutPos = excess;

  return text.slice(cutPos).trimStart();
}

// Parses text for #LZ_text(CardName)# and #LZ_begin(cardName)# ... #LZ_end# markers.
// Replaces #LZ_text(CardName)# with story card content if found, otherwise logs an error and removes it.
// Extracts text inside #LZ_begin(cardName)# ... #LZ_end# blocks, saves it to that card, and removes the block.
function lzParser(text) {
  if (typeof text !== "string") return "";

  // Replace all #LZ_text(CardName)# markers
  text = text.replace(/#LZ_text\(([^)]+)\)#/g, (match, cardName) => {
    const content = getLzTextFromSC(cardName.trim());
    if (content === "") {
      JackLog(LOG_ERROR, `Story card "${cardName}" not found for LZ_text.`);
      return "";
    }
    return content;
  });

  // Process all #LZ_begin(cardName)# ... #LZ_end# blocks
  const blockRegex = /#LZ_begin\(([^)]+)\)#([\s\S]*?)#LZ_end#/g;
  text = text.replace(blockRegex, (match, cardName, blockContent) => {
    const name = cardName.trim();
    JackSaveCard(name, blockContent);
    return "";
  });

  return text;
}

// ======================================================
// === Input Modification Helpers
// ======================================================
function JackAppendSuccessInfo(text) {
//  const sayPattern = /^>\s*You\s+\w+/i;
//  const doPattern = /^>\s*You\s+\w+/i;
const sayPattern = /^>\s*You say "/i;
const doPattern  = /^>\s*You\s+(?!say\s+)\w+/i;

  function matchOrChance(prob, inputText) {
    if (!prob) return false;
    prob = stripQuotes(JackEvalValue(prob));
    if (/^\/.*\/[gimsuy]*$/.test(prob)) {
      const regex = new RegExp(prob.slice(1, prob.lastIndexOf('/')), prob.slice(prob.lastIndexOf('/') + 1));
      return regex.test(inputText);
    }
    const val = parseFloat(prob);
    return !isNaN(val) && Math.random() < val;
  }

  if (sayPattern.test(text)) {
    if (state.JackSayFailText && matchOrChance(state.JackSayFailRate, text)) {
      text += state.JackSayFailText;
    } else if (state.JackSayCritSuccessText && matchOrChance(state.JackSayCritSuccessRate, text)) {
      text += state.JackSayCritSuccessText;
    }
    state.JackSayFailRate = '';
    state.JackSayCritSuccessRate = '';
  } else if (doPattern.test(text)) {
    if (state.JackDoFailText && matchOrChance(state.JackDoFailRate, text)) {
      text += state.JackDoFailText;
    } else if (state.JackDoCritSuccessText && matchOrChance(state.JackDoCritSuccessRate, text)) {
      text += state.JackDoCritSuccessText;
    }
    state.JackDoFailRate = '';
    state.JackDoCritSuccessRate = '';
  }
  return text;
}

// ======================================================
// === Debug / Logging Functions
// ======================================================

// === Logging ===
function JackLog(type, text) {
  switch (type) {
    // User Error
    case LOG_ERROR: {
      if (state.verboseLevel >= LOG_ERROR) {
        state.message = text;
        state.debugOutput += "ERROR: " + text + "\n";
      }
      break;
    }
    // Error in Jack Preprocessor
    case LOG_SYS_ERROR: {
      if (state.verboseLevel >= LOG_SYS_ERROR) {
        state.message = text;
        console.log(text);
        state.debugOutput += "System ERROR: " + text + "\n";
      } else {
        console.log(text);
      }
      break;
    }
    // Log AI Responses
    case LOG_AI: {
      if (state.verboseLevel >= LOG_AI) {
        state.message = text;
        state.debugOutput += text + "\n";
      }
      break;
    }
    // Log directives:
    case LOG_COMMAND:
    case LOG_STORY:
    case LOG_VAR: {
      if (state.verboseLevel >= type) {
        state.debugOutput += text + "\n";
      }
      break;
    }
  }
}

// === Dump defines ===
function JackDumpDefs() {
  delete state.JackDefsMap.LAST_OUTPUT;
  return Object.entries(state.JackDefsMap).map(([k, v]) => k + "=" + v).join(", ");
}

// === Helper for Outputting Memory Usage ===
function JackDebugStateSize(sysOut) {
  function estimateSize(obj) {
    const seen = new WeakSet();
    function calc(value) {
      if (value === null || typeof value !== 'object') return 8;
      if (seen.has(value)) return 0;
      seen.add(value);
      let bytes = 0;
      for (const key in value) {
        bytes += key.length * 2;
        try {
          bytes += calc(value[key]);
        } catch { }
      }
      return bytes;
    }
    return calc(obj);
  }

  const defsCount = state.JackDefsMap instanceof Map ? state.JackDefsMap.size : Object.keys(state.JackDefsMap || {}).length;
  const defsSize = estimateSize(state.JackDefsMap);
  const stateCount = Object.keys(state || {}).length;
  const stateSize = estimateSize(state);

  sysOut += `\nJackDefsMap: ${defsCount} vars, approx ${(defsSize / 1024).toFixed(1)} KB memory`;
  sysOut += `\nState: ${stateCount} vars, approx ${(stateSize / 1024).toFixed(1)} KB memory`;
  if (state.JackMaxContextSize) sysOut += `\nMax Context limit: ${state.JackMaxContextSize} characters.`;
  return sysOut;
}

// ======================================================
// === Output Handling (#OUT/#OUTPUT/#DEBUG)
// ======================================================

// Output is managed by pushing output modification commands
// to state.JackOutputCommands - struct

function JackOutputClean(text) {
  if (typeof text !== "string") return text;
  // remove trailing spaces, tabs and line feeds; remove leading spaces but keep leading newlines
  let s = text.replace(/[ \t\r\n]+$/g, "").replace(/^[ ]+/g, "");
  return s.startsWith("\n") ? s : " " + s;
}

// === Function to add commands for output processing ===
// Requires: state.JackOutputCommand-variable and JackOutputProcess()
function JackAddOutputCommand(cmd, arg1="", arg2="") {
  const valid = ["prepend", "append", "replace", "swap", "remove", "clear", "stop"];
  if (valid.indexOf(cmd) !== -1) {
    state.JackOutputCommands.push({ cmd: cmd, arg1: arg1, arg2: arg2 });
  }
}

function JackUnescape(str) {
  return String(str)
    .replace(/\\\\/g, "\\")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");
}

// === Output-hook function to process #OUTPUT directive ===
function JackOutputProcess(text) {
    
    while (state.JackOutputCommands.length > 0) {
      var c = state.JackOutputCommands.shift();
      var cmd = c.cmd;
      var arg1 = JackUnescape(c.arg1 || "");
      var arg2 = JackUnescape(c.arg2 || "");

      if (cmd === "prepend") {
        text = arg2 + arg1 + arg2 + text;
      }
      else if (cmd === "append") {
        text = text + arg2 + arg1 + arg2;
      }
      else if (cmd === "SC") {
        const content = getCardText(arg1.trim());
        if (content === "") {
          JackLog(LOG_ERROR, `Story card "${arg1}" not found for LZ_text.`);
        } else {
          if (arg2 === "append") {
            text = text + content;
          }
          else if (arg2 === "prepend") {
            text = content + text;
          } else {
            text = content;
          }
        }
      }
      else if (cmd === "replace") {
        // detect regex string format like "/pattern/flags"
        if (typeof arg1 === "string" && arg1[0] === "/" && arg1.lastIndexOf("/") > 0) {
          var lastSlash = arg1.lastIndexOf("/");
          var pattern = arg1.slice(1, lastSlash);
          var flags = arg1.slice(lastSlash + 1);
          var regex = new RegExp(pattern, flags);

          // replace using .match to check group existence
          text = text.replace(regex, function (match) {
            var found = match.match(regex);
            if (found && found.length > 1) {
              // capturing group exists
              return match.replace(found[1], arg2);
            }
            return arg2;
          });
        } else {
          // plain string replacement
          text = text.split(arg1).join(arg2);
        }
      }
      else if (cmd === "swap") {
        text = text.split(arg1).join(arg2);
      }
      else if (cmd === "remove") {
        text = text.split(arg1).join("");
      }
      else if (cmd === "clear") {
        text = "";
      }
      else if (cmd === "stop") {
        break;
      }
    }

  // Store last clean output before debug messages
  state.lastOutput = text;

  // Clear input
  if (state.lastInput) state.lastInput = "";

  // Collect debug info
  let sysOut = "";

  if (state.debugOutput) {
    sysOut += state.debugOutput;
  }

  let dbg = JackGetUserDebug();
  if (dbg) {
    sysOut += "\n#DEBUG directives:\n" + dbg;
  }
  if (state.verboseLevel >= LOG_AI) {
    sysOut += JackAiQuestionsDump();
  }
  if (state.verboseLevel >= LOG_VAR) {
    sysOut += "User Variables:\n" + JackDumpDefs(state.JackDefsMap) + "\n";
  }
  if (state.verboseLevel == LOG_VERSION) {
    sysOut += "\nJP-Version: " + VERSION;
    sysOut += "\ninfo.actionCount: " + info.actionCount;
    sysOut = JackDebugStateSize(sysOut);
    if (state.verboseLevel == LOG_VERSION) state.verboseLevel = state.verboseLevel - 1;
    else sysOut += "Note: /debug on (disable these with /debug off)";
  }

  // Output SYSTEM messages if any
  if (sysOut) {
    text += "\n<SYSTEM>" + sysOut + "</SYSTEM>\n";
  }

  // We don't want user input to be persistent even when no input
  delete state.JackDefsMap.USER_INPUT;

  return JackOutputClean(text);
}


// ======================================================
// === Story Status Detectors
// ======================================================
/* Location context-data Examples
Location: Library includes shelves, books, and reading tables. There are librarians, quiet, silence, and dust. Place for studying and reading.
Location: Lake (or dock) includes water, shore, and boats. Place for fishing and swimming.
*/
function JackParseLocationContext(context = "") {
  const lines = context.split(/\r?\n/);
  const locs = {};

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed.toLowerCase().startsWith("location:")) continue;

    let part = trimmed.slice(9).trim();
    const nameMatch = part.match(/^([A-Z][A-Za-z0-9_]+|[a-z][a-z0-9_]+)(?:\s*\(([^)]+)\))?/);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    const alts = nameMatch[2]
      ? nameMatch[2].split(/,|\bor\b/).map(x => x.trim()).filter(x => x && !/room$|place$|area$|space$/i.test(x))
      : [];

    const lowerSensitive = /^[a-z]/.test(name);
    const wordVariants = w => lowerSensitive
      ? [w.toLowerCase(), w.charAt(0).toUpperCase() + w.slice(1)]
      : [w];

    const includesMatch = part.match(/includes\s+([^\.]+)/i);
    const strongMatch = part.match(/there\s+(?:is|are)?\s*([^\.]+)/i);
    const placeForMatch = part.match(/place\s+for\s+([^\.]+)/i);

    const cleanList = s => s.replace(/\b(and|a|the|are|is|that|,)\b/gi, " ")
      .split(/\s+/)
      .map(x => x.trim())
      .filter(Boolean);

    const inside = includesMatch ? cleanList(includesMatch[1]) : [];
    let strong = [
      ...(strongMatch ? cleanList(strongMatch[1]) : []),
      ...(placeForMatch ? cleanList(placeForMatch[1]) : [])
    ];

    const extendedStrong = [];
    for (let word of strong) {
      extendedStrong.push(word);
      if (word.endsWith("ing") && word.length > 4) {
        const base = word.replace(/ing$/, "");
        extendedStrong.push(base, base + "s");
      }
    }

    locs[name] = {
      main: [...wordVariants(name), ...alts.flatMap(wordVariants)].map(x => x.toLowerCase()),
      inside: inside.map(x => x.toLowerCase()),
      strong: extendedStrong.map(x => x.toLowerCase())
    };
  }

  return locs;
}

function JackDetectCategory(
  text,
  categoryData,
  threshold = 0.45,
  protagonists = [],
  remove_dialog = true,
  initialLabel = ""
) {
  const negationWords = ["not","never","no","isn't","wasn't","won't","didn't","don't","without"];
  const modalWords = [
    "would","could","might","should","may","perhaps","maybe",
    "remember","remembered","recall","recalled","think","thought","imagine","suppose",
    "dreamed","pretend","wish","if only","used to","hope",
    "read","reads","memory","talked","says","said","mentioned","dial","call"
  ];
  const enterIndicators = ["enter","arrive","push open","come in","walk in","walk down","step in","step into","step inside","run in","reach"];
  const exitIndicators = ["leave","left","exit","walk out","step out","go out","run out"];

  if (remove_dialog)
    text = text.replace(/(['"])(?:(?!\1).)*\1/g, "");

  //const matchesLoose = (s, list) => list.some(w => new RegExp("\\b" + w + "\\b", "i").test(s));
  const matchesLoose = (s, list) => {
    return list.some(w => {
      // original word
      const base = w.toLowerCase();
  
      // singular form for words ending with "s"
      let alt = null;
      if (base.endsWith("s") && base.length > 1) {
        alt = base.slice(0, -1);
      }
  
      // build patterns
      const p1 = new RegExp("\\b" + base + "\\b", "i");
      const p2 = alt ? new RegExp("\\b" + alt + "\\b", "i") : null;
  
      return p1.test(s) || (p2 && p2.test(s));
    });
  };  
  const hasProtagonist = s => protagonists.length ? matchesLoose(s, protagonists) : true;

  // --- Improved sentence splitting ---
  const sentences = text
    .replace(/\r?\n+/g, " ")
    // protect "a.m." / "p.m." patterns, including variants like "3 a.m.", "3:00 a.m."
    .replace(/\b(\d{1,2})(:\d{2})?\s*(a\.m\.|p\.m\.)/gi, (_, h, m, ap) =>
      `${h}${m || ""}§${ap.replace(/\./g, "§")}`
    )
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map(s => s.replace(/§/g, ".").trim())
    .filter(Boolean);

  const scores = {};
  for (let label in categoryData) scores[label] = (label === initialLabel) ? 2 : 0;

  for (let s of sentences) {
    s = " " + s.toLowerCase() + " ";
    const protagonistPresent = hasProtagonist(s);
    const negated = negationWords.some(w => s.includes(" " + w + " "));
    const hypothetical = modalWords.some(w => s.includes(" " + w + " "));
    const uncertainty = hypothetical || negated;
    let decay = 0;

    for (let label in categoryData) {
      const c = categoryData[label];
      const hitMain = matchesLoose(s, c.main);
      const hitInside = new RegExp(
        "\\b(?:in|at|inside)\\b(?:\\s+\\w+){0,2}\\s+\\b(" + c.main.join("|") + ")\\b", "i"
      ).test(s);
      const hitStrong = matchesLoose(s, c.strong);
      const hitObjectInside = matchesLoose(s, c.inside);
      const entering = matchesLoose(s, enterIndicators);
      const leaving = matchesLoose(s, exitIndicators);
      let delta = 0;

      // --- prefix pattern "The [label] is ..." ---
      const startsWithLabel =
        new RegExp("^\\s*the\\s+(" + c.main.join("|") + ")\\s+is\\b", "i").test(s);

      // handle leaving
      if (leaving && !negated) {
        if (protagonistPresent && hitMain) {
          if (!hypothetical)
            scores[label] = 0; //<-A
          else
            scores[label] *= 0.7; //<-B
          continue;
        } else if (protagonistPresent && !hitObjectInside) {
          if (!hypothetical)
            scores[label] *= 0.4; //<-C
          else
            scores[label] *= 0.9; //<-E
          continue;
        } else if (protagonistPresent && hitObjectInside) {
          if (!hypothetical)
            scores[label] *= 1; //<-F
          else
            scores[label] *= 1.2; //<-G
          continue;
        }
      }

      // --- Adjusted weights ---
      if (hitMain && entering && !uncertainty) {
        if (protagonistPresent)
          delta += 2.2; // <-H (was 2.5)
        else
          delta += 0.8; // <-I (was 0.5)
      } else if (hitMain && !uncertainty) {
        delta += 0.3; // <-J (was 0.4)
      }
      if (hitStrong) delta += 0.35; // <-K (was 0.5)
      if (hitInside && !uncertainty) delta += 1.2; //<-L (was 1.0)
      if (hitObjectInside) delta += 0.25; //<-M (was 0.3)
      if (startsWithLabel) delta += 0.8; // (N)

      // Calculate decay if strong hit
      if (delta > (threshold + 1.0)) {
        decay = Math.max(scores[label] / 4, decay); // changed /5 → /4
      }

      scores[label] += delta;
      scores[label] = Math.max(0, scores[label]);
      if (scores[label] > 2) scores[label] = 2;
    }

    // apply decay if some locations got hits
    for (let label in scores) {
      scores[label] -= decay;
    }
  }

  let best = null, bestScore = 0;
  for (let k in scores)
    if (scores[k] > bestScore) { best = k; bestScore = scores[k]; }

  const total = Object.values(scores).reduce((a,b)=>a+b,0);
  const probability = total ? bestScore / total : 0;
  if (!best || probability < threshold) return { label: "unsure", probability, scores };
  return { label: best, probability, scores };
}

// --- Improved time-of-day detector with numeric a.m./p.m. recognition ---
function JackDetectTimeOfDay(text, threshold = 0.45, initialLabel = "") {
    // FIX: ensure text is always a string to avoid errors on .replace/.match
    text = (text == null) ? "" : String(text);
  
    const data = {
      morning: { main: ["morning","sunrise","dawn","daybreak","breakfast"], inside: [], strong: ["wake up","woke up","breakfast","nightgown","from bed"] },
      midday: { main: ["noon","midday","lunchtime","early afternoon","after lunch"], inside: [], strong: ["lunch","sun shine"] },
      evening: { main: ["evening","sunset","dusk","twilight","dinner","late afternoon"], inside: [], strong: ["dinner","getting late"] },
      night: { main: ["night","midnight","went to bed","asleep","moonlight"], inside: [], strong: ["bed","sleep","sleeping","darkness","moon","stars","nightgown","can't sleep","into bed"] }
    };
  
    const exclusions = ["yesterday evening","last evening","tomorrow morning","the night before"];
    // FIX: escape exclusions for safe RegExp creation
    function escapeForRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
    for (let ex of exclusions) {
      try {
        text = text.replace(new RegExp(escapeForRe(ex), "gi"), "");
      } catch (e) {
        // FIX: fallback to simple replace if RegExp construction unexpectedly fails
        text = text.split(ex).join("");
      }
    }
  
    // --- Time numeric detection ---
    const timeMatch = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.m\.|p\.m\.)\b/i);
    if (timeMatch) {
      const hour = parseInt(timeMatch[1], 10);
      const period = timeMatch[3].toLowerCase();
      if (period.startsWith("a")) {
        if (hour >= 0 && hour <= 5) return ["night", 1.0, {}];
        return ["morning", 1.0, {}];
      } else {
        return ["evening", 1.0, {}];
      }
    }
  
    const result = JackDetectCategory(text, data, threshold, [], false, initialLabel);
  
    // FIX: guard if JackDetectCategory returned null/undefined
    if (!result) return ["", 0, {}];
  
    // --- ADDED: apply initialLabel influence mapping ---
    let label = (result.label || "").toLowerCase();
    const init = (initialLabel || "").toLowerCase();
  
    if (init === "morning") {
      if (label === "midday" || label === "evening") label = "midday";
      else label = "morning";
    } else if (init === "midday") {
      if (label === "evening" || label === "night") label = "evening";
      else label = "midday";
    } else if (init === "evening") {
      if (label === "night" || label === "morning") label = "night";
      else label = "evening";
    } else if (init === "night") {
      if (label === "morning" || label === "midday") label = "morning";
      else label = "night";
    }
    // --- end ADDED block ---
  
    // FIX: return the possibly adjusted label and guard probability/scores
    return [label || result.label || "", (typeof result.probability === "number") ? result.probability : 0, result.scores || {}];
}

function JackDetectLocation(text, context = "", protagonists = [], threshold = 0.6, initialLabel = "") {
  const data = JackParseLocationContext(context);
  if (!Object.keys(data).length) return ["unsure", 0, {}];
  const result = JackDetectCategory(text, data, threshold, protagonists, true, initialLabel);
  if (result.probability >= threshold) return [result.label, result.probability, result.scores];
  return ["unsure", 0, result.scores];
}

// -------------------- helpers --------------------

function JackSplitSentences(text) {
    return text.split(/(?<=[.!?])\s+/).filter(s => s.length > 0);
}

function JackNormalizeTitle(title) {
    return getPlainTitle(title, relationshipSymbols);
}

function JackHasGender(card, gender) {
    return typeof card.entry === "string" &&
           new RegExp("^#gender\\s+" + gender, "im").test(card.entry);
}

function JackTokenizeSentence(sentence) {
    return sentence.split(/[\s.,'";:?!()\n]+/);
}

function JackNameMatchesToken(token, name) {
    if (!token) return false;
    if (token === name) return true;
    if (token === name + "'s") return true;
    return false;
}

function JackFindFirstMention(sentence, characters) {
    const tokens = JackTokenizeSentence(sentence);
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        for (const c of characters) {
            for (const part of c.parts) {
                if (JackNameMatchesToken(token, part)) {
                    return c;
                }
            }
        }
    }
    return null;
}

// -------------------- main --------------------
function JackUpdateCharacterRelations(text)
{
    if (typeof text !== "string") return;

    let cards;
    try {
        cards = JackGetAllCards(c => c.type === "character");
    } catch {
        return;
    }

    const characters = [];
    for (const c of cards) {
        const plain = JackNormalizeTitle(c.title);
        if (!plain) continue;

        characters.push({
            card: c,
            name: plain,
            parts: plain.split(/\s+/),
            male: JackHasGender(c, "male"),
            female: JackHasGender(c, "female"),
            present: false,
            mood: 0,
            changed: false
        });
    }

    const positiveIndicators = [
        "smiles","laughs","grins","nods","relaxes","agrees","thanks","comforts",
        "encourages","approves","orgasm","pleasure","arousal","sweet spot",
        "kisses","embraces","touches","caresses","leans closer","softens",
        "teases","giggles","responds warmly","moans","whispers","admits",
        "accepts","trusts","welcomes","soothes","strokes","pulls closer",
        "enjoying","enjoys","intrigued","respect","murmur","smile","intimate",
        "warmth","smirk playing","honest","lets out a short laugh","lets out a laugh",
        "breath hitching","thumb brushes lightly","body brushing against yours",
        "half-lidded eyes","meets your kiss","heat between you","lips brush","huggs"
    ];

    const negativeIndicators = [
        "cries","shouts","yells","frowns","argues","threatens","gets angry",
        "storms","insults","slams","flinches","silence stretches",
        "swallows hard","stomach twists","akward","voice wobbles",
        "pulls away","tenses","snaps","glares","scoffs","growls",
        "irritated","annoyed","resentful","coldly","withdraws","hesitates",
        "unyielding","undercurrent","amusement","tone neutral","fingers tighten",
        "eyes narrow","dismissive","irritation","shoulders squaring",
        "spring winding","face burning","explain yourself","angry"
    ];

    const sentences = JackSplitSentences(text);
    const moodWindow = 40;
    const moodStart = Math.max(0, sentences.length - moodWindow);
    
    let lastMale = null;
    let lastFemale = null;
    
    // ---------- PASS 1: presence + pronoun resolution over full text ----------
    
    for (const s of sentences) {
        let mentioned = JackFindFirstMention(s, characters);
        const tokens = JackTokenizeSentence(s);
    
        if (!mentioned) {
            for (const t of tokens) {
                if (lastFemale && (t === "She" || t === "she" || t === "Her" || t === "her")) {
                    mentioned = lastFemale;
                    break;
                }
                if (lastMale && (t === "He" || t === "he" || t === "His" || t === "his" || t === "Him" || t === "him")) {
                    mentioned = lastMale;
                    break;
                }
            }
        }
    
        if (!mentioned) continue;
    
        if (mentioned.female) {
            if (lastFemale && lastFemale !== mentioned) {
                lastFemale.present = false;
                lastFemale.mood = 0;
            }
            lastFemale = mentioned;
        }
    
        if (mentioned.male) {
            if (lastMale && lastMale !== mentioned) {
                lastMale.present = false;
                lastMale.mood = 0;
            }
            lastMale = mentioned;
        }
    
        mentioned.present = true;
    }
    
    // ---------- PASS 2: mood analysis only on last N sentences ----------
    
    for (let i = moodStart; i < sentences.length; i++) {
        const s = sentences[i];
        let mentioned = JackFindFirstMention(s, characters);
        const tokens = JackTokenizeSentence(s);
    
        if (!mentioned) {
            for (const t of tokens) {
                if (lastFemale && (t === "She" || t === "she" || t === "Her" || t === "her")) {
                    mentioned = lastFemale;
                    break;
                }
                if (lastMale && (t === "He" || t === "he" || t === "His" || t === "his" || t === "Him" || t === "him")) {
                    mentioned = lastMale;
                    break;
                }
            }
        }
    
        if (!mentioned || !mentioned.present) continue;
    
        const lower = s.toLowerCase();
        let pos = 0;
        let neg = 0;
    
        for (const p of positiveIndicators) {
            if (lower.includes(p)) pos++;
        }
        for (const n of negativeIndicators) {
            if (lower.includes(n)) neg++;
        }
    
        if (pos > neg) mentioned.mood++;
        else if (neg > pos) mentioned.mood--;
    }
  
    // -------------------- apply updates --------------------
  
  for (const c of characters) {
        let state = JackGetCardState(c.card.title, relationshipSymbols);
        if (state === -1) state = 4;

        let newState = state;
        if (c.present) {
            if (c.mood > 0) newState++;
            else if (c.mood < 0) newState--;
        }

        newState = Math.max(0, Math.min(newState, relationshipSymbols.length - 1));

        let newEntry = c.card.entry || "";
        if (newState !== state) {
            if (/^#set STATUS \(\d+\)/m.test(newEntry)) {
                newEntry = newEntry.replace(
                    /^#set STATUS \(\d+\)/m,
                    "#set STATUS (" + newState + ")"
                );
            } else {
                newEntry = "#set STATUS (" + newState + ")\n" + newEntry;
            }
            c.changed = true;
        }

        const newTitle = (newState !== state)
            ? getTitle(c.card.title, relationshipSymbols, newState)
            : c.card.title;

        if (!c.changed && newTitle === c.card.title) continue;

        JackBuildCard(
            newTitle,
            newEntry,
            c.card.type,
            c.card.keys,
            c.card.description,
            0
        );

        JackRemoveCardWithTitle(c.card.title);
    }
}
