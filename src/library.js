// === Global variables ===
const VERSION = "v1.1.7-beta";

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
const LOG_VAR = 4; // Log All Variables
const LOG_AI = 5; // Log Ai Responses
const LOG_STORY = 6; // Log story guidance
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
    state.debugOutput += "\n\nCONTEXT_IN:\n============\n" + text + "\n============\n";
  }

  // Split context into their sections
  let context = JackSplitContext(text);

  // Process sections in the specified order if they exist
  const preprocessOrder = ["Plot Essentials", "World Lore", "[Author's note]"];
  for (const section of preprocessOrder) {
    if (context[section]) {
      context[section] = JackPreprocessDirectives(context[section]);
    }
  }

  // Make output prepend visible for AI in advance
  if (state.JackOuputPrepend) {
    context["Recent Story"] = (context["Recent Story"] || "") + state.JackOuputPrepend;
  }

  if (state.JackMaxContextSize) { 
    if (context["Recent Story"]) { 
      context["Recent Story"] = JackReduceTextSize(context["Recent Story"], state.JackMaxContextSize);
    } 
  }

  // Add relevant facts to the Author's Note
  if (state.JackFacts) {
    context["[Author's note]"] = (context["[Author's note]"] || "") + state.JackFacts;
  }
  if (state.JackScene) {
    context["[Author's note]"] = (context["[Author's note]"] || "") + state.JackScene;
  }

  // Modify User input
  if (context["User Input"]) {
    context["User Input"] = JackAppendSuccessInfo(context["User Input"]);
  }

  // Merge everything back
  text = JackMergeContext(context);

  // Next
  if (state.JackDefsMap.hasOwnProperty("NEXT")) {
    let guidance = "\n[Guidance for continuation: " + state.JackDefsMap.NEXT + "]\n";
    text += guidance;
    JackLog(LOG_STORY, guidance);
  }

  return text;
}

// ======================================================
// === Jack Preprocessor Core
// ======================================================
function removeSystemTags(input) {
  // Regex to match innermost <SYSTEM>...</SYSTEM> pairs
  const regex = /<SYSTEM>([^<]*(?:(?!<\/?SYSTEM>)<[^<]*)*?)<\/SYSTEM>/g;
  let result = input;
  
  // Keep replacing until no more tags are found
  while (regex.test(result)) {
      result = result.replace(regex, '$1');
  }
  
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

  // Capture last output
  if (state.lastOutput) {
    state.JackDefsMap.LAST_OUTPUT = state.lastOutput;
  }

  // TURN increment
  let cur = parseInt(state.JackDefsMap.TURN, 10);
  if (isNaN(cur)) cur = -1;
  state.JackDefsMap.TURN = String(cur + 1);

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
  let scene = "";
  let prepends = [];

  state.JackDefsNamespace = "";
  state.JackInBlockComment = false;

  // Java block support
  let inJavaBlock = false;
  let java_block_code = "";
  const _jack_protect_vars = [];
  const _jack_protect_name = "_jack_protect_vars_987654321";

  const lines = (text || "").split(/\r?\n/);
  const out = [];
  const active = [true];
  const branchTaken = [];

  for (let line of lines) {

    let rawLine = line;
    let t = line;

    // Handle lines inside java block
    if (inJavaBlock && !t.startsWith("#java_end")) {
      java_block_code += rawLine + "\n";
      continue;
    }

    // Handle comments if enabled
    if (state.JackRemoveCommentedLines) {
      t = JackStripComments(t);
      if (!t) continue;
    }

    // Handle non-command context
    if (!t.startsWith("#")) {
      if (active[active.length - 1]) {
        out.push(JackEvalValue(rawLine));
      }
      continue;
    }

    // Process #-commands
    const [directiveRaw, ...restArr] = t.split(/\s+/);
    const directive = (directiveRaw || "").toLowerCase();
    const rest = restArr.join(" ").trim();
    const parent = active[active.length - 1];

    switch (directive) {
      case "#def":
      case "#define":
      case "#set": {
        if (!parent) break;
        const m = rest.match(/^([A-Za-z0-9_:.]+)(?:\s+(.*))?$/s);
        if (m) {
          let key = JackResolveKey(m[1]);
          let val = m[2] || "";
          val = stripQuotes(JackEvalValue(val.trim()));
          state.JackDefsMap[key] = val;
          JackLog(LOG_COMMAND, key + " <- " + val);
        } else {
          JackLog(LOG_ERROR, "Invalid #define/#set format: " + rawLine);
        }
        break;
      }
      case "#app":
      case "#append": {
        if (!parent) break;
        const m = rest.match(/^([A-Za-z0-9_]+)\s+(.*)$/s);
        if (m) {
          let key = JackResolveKey(m[1]), val = stripQuotes(JackEvalValue(m[2].trim()));
          state.JackDefsMap[key] = (state.JackDefsMap[key] || "") + val;
          JackLog(LOG_COMMAND, key + " appended " + val);
        } else {
          JackLog(LOG_ERROR, "Invalid #append format: " + rawLine);
        }
        break;
      }
      case "#ns":
      case "#namespace": {
        if (!parent) break;
        let ns = stripQuotes(rest.trim());
        if (!ns || /^global$/i.test(ns)) ns = "";
        state.JackDefsNamespace = ns;
        JackLog(LOG_COMMAND, "NAMESPACE <- " + ns);
        break;
      }
      case "#undef": {
        if (!parent) break;
        if (!rest) {
          JackLog(LOG_ERROR, "Missing argument for #undef: " + rawLine);
          break;
        }
        let key = JackResolveKey(rest.split(/\s+/)[0]);
        delete state.JackDefsMap[key];
        JackLog(LOG_COMMAND, key + " <- undefined");
        break;
      }
      case "#ifdef": {
        let key = JackResolveKey(rest.split(/\s+/)[0]);
        const cond = parent && state.JackDefsMap.hasOwnProperty(key);
        active.push(cond);
        branchTaken.push(cond);
        break;
      }
      case "#if_uin":
      case "#if_user_input": {
        if (!rest) {
          const cond = parent && state.JackDefsMap.USER_INPUT;
          active.push(cond);
          branchTaken.push(cond);
        } else {
          if (rest.match(/^\s*\/*.\/[dgimsuvy]?[dgimsuvy]?\s*$/i)) {
            let condExpr = "REGEX(" + rest + ",{USER_INPUT})";
            const cond = parent && JackCheckCondition(condExpr);
            active.push(cond);
            branchTaken.push(cond);
          } else {
            let condExpr = "INCLUDES(" + rest + ",{USER_INPUT})";
            const cond = parent && JackCheckCondition(condExpr);
            active.push(cond);
            branchTaken.push(cond);
          }
        }
        break;
      }
      case "#ifndef": {
        let key = JackResolveKey(rest.split(/\s+/)[0]);
        const cond = parent && !state.JackDefsMap.hasOwnProperty(key);
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
          let prev = active.pop();
          let prevTaken = branchTaken.pop();
          const prev_parent = active[active.length - 1];
          const cond = prev_parent && !prevTaken && JackCheckCondition(rest);
          active.push(cond);
          branchTaken.push(prevTaken || cond);
        } else {
          JackLog(LOG_ERROR, "Unexpected #elif without matching #if: " + rawLine);
        }
        break;
      }
      case "#else": {
        if (active.length > 1) {
          let prev = active.pop();
          let prevTaken = branchTaken.pop();
          const prev_parent = active[active.length - 1];
          const cond = prev_parent && !prevTaken;
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
        out.push(rest);
        break;
      }
      case "#max_size:": {
        if (!parent) break;
        let delay = rest ? parseInt(rest, 10) : null;
        if (delay !== null && !isNaN(delay)) {
          state.JackMaxContextSize = delay;
        } else {
          JackLog(LOG_ERROR, "Unexpected #max_context_size directive.");
        }
        break;
      } 
      case "#out":
      case "#output": {
        if (!parent) break;
        let m = rest.match(/^("[^"]+"|'[^']+'|\S+)(?:\s+("[^"]+"|'[^']+'|\S+))?/);
        if (m) {
          let cmd = stripQuotes(m[1]);
          let arg1 = m[2] ? stripQuotes(JackEvalValue(m[2])) : "";
          if (cmd && !arg1) { arg1 = cmd; cmd = "prepend"; }
          JackAddOutputCommand(cmd, arg1, "");
          if (cmd === "prepend") prepends.push(arg1);
        } else {
          JackLog(LOG_ERROR, "Invalid #OUTPUT format: " + rawLine);
        }
        break;
      }
      case "#ask":
      case "#asking": {
        if (!parent) break;
        let m = rest.match(/^([A-Za-z0-9_]+)\s+"([^"]+)"(?:\s+\(([^)]+)\))?/);
        if (m) {
          let key = JackResolveKey(m[1]), question = m[2], expect = m[3] ? m[3].toLowerCase() : null;
          let choices = null;
          let cm = rest.match(/list=\[([^\]]+)\]/i);
          if (cm) {
            choices = cm[1].split(/\s*,\s*/);
            expect = "string";
          }
          if (!expect) {
            if (/^\s*(is|are|was|were|do|does|did|has|have|had|can|could|will|would|should|may|might|shall|am)\b/i.test(question) || /\bor\b/i.test(question)) expect = "none";
            else expect = "string";
          }
          if (!["bool", "int", "string", "none", "name"].includes(expect)) expect = "string";
          if (!(expect === "none" && state.JackDefsMap.hasOwnProperty(key))) JackAddAiQuestion(key, question, expect, choices);
          if (directive === "#asking" && state.JackAiQuestions[key]) state.JackAiQuestions[key].ready = false;
        } else {
          JackLog(LOG_ERROR, "Invalid #ASK format: " + rawLine);
        }
        break;
      }
      case "#refresh": {
        if (!parent) break;
        //let key = rest.split(/\s+/)[0];
        let key = JackResolveKey(rest.split(/\s+/)[0]);
        if (state.JackAiQuestions[key]) {
          state.JackAiQuestions[key].ready = false;
          JackLog(LOG_COMMAND, "#REFRESH cleared ready for " + key);
        }
        break;
      }
      case "#dbg":
      case "#debug": {
        if (!parent) break;
        if (state.JackDefsMap["DEBUG_OFF"] === undefined) {
          let val = stripQuotes(JackEvalValue(rest.trim()));
          if (!state.JackDefsMap.DEBUG) state.JackDefsMap.DEBUG = "";
          state.JackDefsMap.DEBUG += val + "\n";
          //state.debugOutput = "#debug: " + val + "\n" + state.debugOutput;
        }
        break;
      }
      case "#debug_off": {
        if (!parent) break;
        state.JackDefsMap["DEBUG_OFF"] = "Debug disabled";
        break;
      }
      case "#debug_on": {
        if (!parent) break;
        delete state.JackDefsMap["DEBUG_OFF"];
        break;
      }
      case "#comment_on": {
        state.JackRemoveCommentedLines = true;
        break;
      }
      case "#comment_off": {
        state.JackRemoveCommentedLines = false;
        break;
      }
      case "#fmem":
      case "#front_memory": {
        if (!parent) break;
        let data = stripQuotes(JackEvalValue(rest.trim()));
        state.memory.frontMemory = data;
        JackLog(LOG_STORY, "state.memory.frontMemory <- " + data);
        break;
      }
      case "#nxt":
      case "#next": {
        if (!parent) break;
        // accept: (5) text    or   5 text   or   text
        const m = rest.match(/^(?:\(?\s*(\d+)\s*\)?\s+)?(.*)$/s);
        if (m) {
          let delay = m[1] ? parseInt(m[1], 10) : null;
          let dataRaw = m[2] ? m[2].trim() : "";
          if (!dataRaw) {
            JackLog(LOG_ERROR, "Missing argument for #next: " + rawLine);
            break;
          }
          let data = stripQuotes(JackEvalValue(dataRaw));
          state.JackDefsMap.NEXT = data;
          if (delay !== null && !isNaN(delay)) {
            state.JackDefsMap.TURNXT = String(parseInt(state.JackDefsMap.TURN, 10) + delay);
          }
          JackLog(LOG_STORY, "NEXT <- " + data + (delay !== null ? " with delay " + delay : ""));
        } else {
          JackLog(LOG_ERROR, "Invalid #next format: " + rawLine);
        }
        break;
      }
      case "#scene": {
        if (!parent) break;
        let data = stripQuotes(JackEvalValue(rest.trim()));
        scene = data;
        break;
      }
      case "#fact": {
        if (!parent) break;
        let data = stripQuotes(JackEvalValue(rest.trim()));
        facts += "- " + data + "\n";
        break;
      }
      case "#user_success": {
        const m = rest.match(/^(\S+)(?:\s+(.*))?$/s);
        if (m) {
          state.JackDoCritSuccessRate = stripQuotes(JackEvalValue(m[1]));
          if (m[2]) state.JackDoCritSuccessText = m[2];
          else state.JackDoCritSuccessText = JACK_DO_CRIT_SUCCESS_TEXT;
          JackLog(LOG_COMMAND, "DO CRIT SUCCESS rate=" + state.JackDoCritSuccessRate + " text=" + (m[2] || "(unchanged)"));
        } else {
          JackLog(LOG_ERROR, "Invalid #user_success format: " + rawLine);
        }
        break;
      }
      case "#user_fail": {
        const m = rest.match(/^(\S+)(?:\s+(.*))?$/s);
        if (m) {
          state.JackDoFailRate = stripQuotes(JackEvalValue(m[1]));
          if (m[2]) state.JackDoFailText = m[2];
          else state.JackDoFailText = JACK_DO_FAIL_TEXT;
          JackLog(LOG_COMMAND, "DO FAIL rate=" + state.JackDoFailRate + " text=" + (m[2] || "(unchanged)"));
        } else {
          JackLog(LOG_ERROR, "Invalid #user_fail format: " + rawLine);
        }
        break;
      }
      case "#user_trusted": {
        const m = rest.match(/^(\S+)(?:\s+(.*))?$/s);
        if (m) {
          state.JackSayCritSuccessRate = stripQuotes(JackEvalValue(m[1]));
          if (m[2]) state.JackSayCritSuccessText = m[2];
          else state.JackSayCritSuccessText = JACK_SAY_CRIT_SUCCESS_TEXT;
          JackLog(LOG_COMMAND, "SAY CRIT SUCCESS rate=" + state.JackSayCritSuccessRate + " text=" + (m[2] || "(unchanged)"));
        } else {
          JackLog(LOG_ERROR, "Invalid #user_trusted format: " + rawLine);
        }
        break;
      }
      case "#user_sus":
      case "#user_suspicious": {
        const m = rest.match(/^(\S+)(?:\s+(.*))?$/s);
        if (m) {
          state.JackSayFailRate = stripQuotes(JackEvalValue(m[1]));
          if (m[2]) state.JackSayFailText = m[2];
          else state.JackSayFailText = JACK_SAY_FAIL_TEXT;
          JackLog(LOG_COMMAND, "SAY FAIL rate=" + state.JackSayFailRate + " text=" + (m[2] || "(unchanged)"));
        } else {
          JackLog(LOG_ERROR, "Invalid #user_suspicious format: " + rawLine);
        }
        break;
      }
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
    state.JackOuputPrepend = prependBlock + state.JackOuputPrepend;
  }

  // Scene
  if (scene) {
    //out.push("\n[Scene: " + scene + "]\n");
    state.JackScene = "\nScene: " + scene + "\n";
    JackLog(LOG_STORY, '\nScene <-- "' + scene + '"\n');
  }

  // Facts
  if (facts) {
    //out.push("\n[Relevant facts:\n" + facts + "]\n");
    if (state.JackFacts) {
      state.JackFacts += facts;
    } else {
      state.JackFacts = "\nRelevant facts:\n" + facts;
    }
    JackLog(LOG_STORY, "\nFacts added:\n" + facts);
  }

  /* TODO: check unbalanced condition stack
  if (active.length !== 1) {
    let err = "Unbalanced directives: missing #endif (depth=" + (active.length-1) + ")\n";
    state.debugOutput += err;
    state.JackDefsMap.DEBUG += err;
  }*/

  // Combine output text and do some empty space clean-up
  text = out.join("\n").trim();
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

// === Macro substitution and special { ... } evaluation ===
function JackApplyMacros(text) {
  text = String(text);

  let changed;
  do {
    changed = false;
    text = text.replace(/\{([^{}]+)\}/g, (m, inner) => {
      inner = inner.trim();

      // first recursively expand any nested macros inside the inner part
      let expanded = JackApplyMacros(inner);

      // variable lookup (return stored value fully expanded)
      if (/^[A-Za-z0-9_:.]+$/.test(expanded)) {
        let key = JackResolveKey(expanded);
        if (state.JackDefsMap.hasOwnProperty(key)) {
          changed = true;
          // return fully-expanded stored value (allows strings and nested macros)
          return JackApplyMacros(String(state.JackDefsMap[key]));
        }
        return m; // undefined variable stays as-is
      }

      // evaluate special functions (like MIN/MAX/AVG)
      try {
        let val = JackEvalSpecial(expanded);
        if (val !== expanded) {
          changed = true;
          return val;
        }
      } catch (e) { }

      // evaluate numeric / arithmetic / string-expression after all substitutions
      try {
        // replace known variable names with either numeric literal or quoted string literal
        let expr = expanded.replace(/\b([A-Za-z0-9_:.]+)\b/g, (k) => {
          if (state.JackDefsMap.hasOwnProperty(k)) {
            let v = String(state.JackDefsMap[k]);
            // if v looks like a pure number/expression, keep as-is; otherwise quote it
            if (/^[0-9+\-*/().\s]+$/.test(v)) return v;
            return JSON.stringify(v);
          }
          return k;
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
      } catch (e) { }

      return expanded;
    });
  } while (changed);

  return text;
}

/*function JackApplyMacros(text) {
  text = String(text);
  let prev;
  do {
    prev = text;
    text = text.replace(/\{([^{}]+)\}/g, (m, inner) => {
      inner = inner.trim();

      // variable lookup
      if (/^[A-Za-z0-9_:.]+$/.test(inner)) {
        let key = JackResolveKey(inner);
        if (state.JackDefsMap.hasOwnProperty(key)) {
          return state.JackDefsMap[key];
        }
        return m; // leave as-is if undefined
      }

      // evaluate special functions or expressions
      try {
        let val = JackEvalSpecial(inner);
        // fallback: numeric expression evaluation
        if (val === inner) {
          let exp = inner.replace(/\b([A-Za-z0-9_]+)\b/g,
            kk => state.JackDefsMap.hasOwnProperty(kk) ? state.JackDefsMap[kk] : kk
          );
          try {
            let r = eval(exp);
            if (typeof r === 'number' && !isNaN(r)) return String(r);
          } catch (e) {}
          return inner; // return original if nothing else
        }
        return val;
      } catch (e) {
        //JackLog(LOG_ERROR, "Macro eval error: " + e.message);
        return m;
      }
    });
  } while (text !== prev);
  return text;
}*/

// === Condition evaluation ===
function JackCheckCondition(expr) {
  try {
    expr = JackApplyMacros(expr);
    // replace remaining known defines
    for (let k in state.JackDefsMap) expr = expr.replace(new RegExp("\\b" + k + "\\b", "g"), state.JackDefsMap[k]);
    // evaluate special function calls in the expression (like P(15%), RND(...), INCLUDES(), REGEX())
    expr = expr.replace(/\b(REGEX|INCLUDES|P|RND|SELECT)\s*\([^)]*\)/g, (m) => JackEvalSpecial(m));
    return !!eval(expr);
  } catch (e) {
    JackLog(LOG_ERROR, "Cond error: " + e.message);
    return false;
  }
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
// === Functions to compress/uncompress text
// ======================================================
// LZ-based compress/decompress (UTF-16 safe, lossless).
const LZUTF16 = (function(){
  function _compress(uncompressed) {
    if (uncompressed == null) return "";
    const dictionary = new Map();
    const data = [];
    let dictSize = 3;
    let w = "";
    let bits = 0, val = 0;
    const outputChar = (v) => {
      // emit 16-bit char
      data.push(String.fromCharCode(v));
    };

    for (let i = 0; i < uncompressed.length; i++) {
      const c = uncompressed.charAt(i);
      const wc = w + c;
      if (dictionary.has(wc)) {
        w = wc;
      } else {
        // output code for w
        const code = (w === "") ? uncompressed.charCodeAt(i) : dictionary.get(w);
        // emit code as 16-bit units: we will normalize codes >= 0
        outputChar(code);
        // add wc to dictionary
        dictionary.set(wc, dictSize++);
        w = c;
      }
    }

    if (w !== "") {
      const code = dictionary.has(w) ? dictionary.get(w) : w.charCodeAt(0);
      outputChar(code);
    }

    // join into string - this is raw 16-bit code units stream; we still need to wrap in a small header
    return String.fromCharCode(0) + data.join("");
  }

  function _decompress(compressed) {
    if (compressed == null || compressed.length === 0) return "";
    // first char reserved header (we used 0)
    if (compressed.charCodeAt(0) !== 0) {
      // not our format, return as-is
      return compressed;
    }

    const data = [];
    const dictionary = [];
    let dictSize = 3;
    let i = 1;
    // read sequential 16-bit char codes
    while (i < compressed.length) {
      data.push(compressed.charCodeAt(i++));
    }

    if (data.length === 0) return "";

    // first code: if < 256 treat as char code
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
      // add w+entry[0] to dictionary
      dictionary[dictSize++] = w + entry.charAt(0);
      w = entry;
    }
    return result;
  }

  // Wrapper that tries to improve compression ratio by encoding frequent codepoints
  // (This is a simple and robust approach for AI Dungeon texts.)
  function compress(input) {
    if (input == null) return "";
    // convert input to a canonical UTF-16 string (JS string is UTF-16 already)
    return _compress(input);
  }

  function decompress(input) {
    if (input == null) return "";
    return _decompress(input);
  }

  return { compress, decompress };
})();

// Example usage:
// const compressed = LZUTF16.compress("Hello, 世界. Some long text ...");
// const original = LZUTF16.decompress(compressed);

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

  // INCLUDES(string, substring)
  m = token.match(/^INCLUDES\s*\(([^,]+),\s*(.+)\)$/i);
  if (m) {
    let str = stripQuotes(JackApplyMacros(m[1].trim()));
    let sub = stripQuotes(JackApplyMacros(m[2].trim()));
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
  if (m) {
    let idxRaw = JackApplyMacros(m[1].trim());
    let idx = parseInt(idxRaw, 10);
    if (isNaN(idx)) return "";
    let list = m[2].split(/,\s*/).map(x => stripQuotes(JackApplyMacros(x.trim())));
    if (list.length === 0) return "";
    if (idx < 1 || idx >= (list.length + 1)) return "";
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

  // Always return continue message if a question was pending
  return CONTINUE_MSG;
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
  const mainHeaders = ["World Lore", "Story Summary", "Memories", "Recent Story"];
  const bracketHeaders = ["Author's note", "Guidance", "Scene"];
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

  // Process Recent Story only if it exists
  if (result["Recent Story"]) {
    let recent = result["Recent Story"];
    const lines = recent.split(/\r?\n/);
    const userInput = [];
    const nonUser = [];

    for (const line of lines) {
      if (/^\s*>\s*/.test(line)) userInput.push(line.replace(/^\s*>\s*/, ""));
      else nonUser.push(line);
    }
    if (userInput.length) result["User Input"] = userInput.join("\n");

    let remainder = nonUser.join("\n");
    const bracketPattern = new RegExp(`\\[(${bracketHeaders.join("|")}):([\\s\\S]*)\\]`, "gm");

    let match;
    while ((match = bracketPattern.exec(remainder)) !== null) {
      const key = `[${match[1]}]`;
      result[key] = (result[key] || "") + match[2].trim();
      remainder = remainder.replace(match[0], "").trim();
    }

    result["Recent Story"] = remainder.trim();
  }

  return result;
}

function JackMergeContext(sections) {
  const mainOrder = ["World Lore", "Story Summary", "Memories", "Recent Story"];
  const bracketHeaders = ["Author's note", "Guidance", "Scene"];
  let output = "";

  if (sections["Plot Essentials"]?.trim()) output += sections["Plot Essentials"].trim() + "\n\n";

  for (const header of mainOrder) {
    if (!sections[header]) continue;
    output += `${header}:\n${sections[header].trim()}\n\n`;

    if (header === "Recent Story") {
      for (const b of bracketHeaders) {
        const key = `[${b}]`;
        if (sections[key]?.trim()) output += `[${b}: ${sections[key].trim()}]\n\n`;
      }

      if (sections["User Input"]?.trim())
        output += sections["User Input"]
          .split(/\r?\n/)
          .map(l => `> ${l}`)
          .join("\n") + "\n\n";
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

// ======================================================
// === Input Modification Helpers
// ======================================================
function JackAppendSuccessInfo(text) {
  const sayPattern = /^>\s*You\s+\w+/i;
  const doPattern = /^>/;

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
  return sysOut;
}

// ======================================================
// === Output Handling (#OUT/#OUTPUT/#DEBUG)
// ======================================================

// Output is managed by pushing output modification commands
// to state.JackOutputCommands - struct

// === Function to add commands for output processing ===
// Requires: state.JackOutputCommand-variable and JackOutputProcess()
function JackAddOutputCommand(cmd, arg1, arg2) {
  const valid = ["prepend", "append", "replace", "swap", "remove", "clear", "stop"];
  if (valid.indexOf(cmd) !== -1) {
    state.JackOutputCommands.push({ cmd: cmd, arg1: arg1, arg2: arg2 });
  }
}

// === Output-hook function to process #OUTPUT directive ===
function JackOutputProcess(text) {
  
  if (!text.includes(CONTINUE_MSG)) {
    while (state.JackOutputCommands.length > 0) {
      var c = state.JackOutputCommands.shift();
      var cmd = c.cmd, arg1 = c.arg1 || "", arg2 = c.arg2 || "";

      if (cmd === "prepend") {
        text = arg2 + arg1 + arg2 + text;
      }
      else if (cmd === "append") {
        text = text + arg2 + arg1 + arg2;
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
  }

  // Store last clean output before debug messages
  state.lastOutput = text;

  // Clear input
  if (state.lastInput) state.lastInput = "";

  // Collect debug info
  let sysOut = "";

  if (state.debugOutput) {
    sysOut += "\ndebugOutput:\n" + state.debugOutput + "\n";
  }

  let dbg = JackGetUserDebug();
  if (dbg) {
    sysOut += "\n#DEBUG directives:\n" + dbg + "\n";
  }
  if (state.verboseLevel >= LOG_AI) {
    sysOut += JackAiQuestionsDump();
  }
  if (state.verboseLevel >= LOG_VAR) {
    sysOut += "\nUser Variables:\n" + JackDumpDefs(state.JackDefsMap) + "\n";
  }
  if (state.verboseLevel >= LOG_VERSION) {
    sysOut += "\nJP-Version: " + VERSION;
    sysOut += "\ninfo.actionCount: " + info.actionCount;
    sysOut = JackDebugStateSize(sysOut);
    if (state.verboseLevel == LOG_VERSION) state.verboseLevel = state.verboseLevel - 1;
    else sysOut += "\nNote: /debug on (disable these with /debug off)";
  }

  // Output SYSTEM messages if any
  if (sysOut) {
    text += "\n<SYSTEM>\n" + sysOut + "\n</SYSTEM>\n";
  }

  // We don't want user input to be persistent even when no input
  delete state.JackDefsMap.USER_INPUT;

  return text;
}
