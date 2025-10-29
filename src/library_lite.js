// Note: This lite-version is alternative for the full library.
// Pick one of them - not both!
// The lite version has limited base functionality only.
// Lite version does NOT require Ai-function calls into context/output-hooks.
const VERSION = "v1.1.8-beta-lite";

state.lastOutput = state.lastOutput || '';
state.debugOutput = state.debugOutput || '';
state.JackDefsMap = state.JackDefsMap || { TURN: "-1", LITE: "true" };
state.JackDefsNamespace = state.JackDefsNamespace || '';
state.JackOutputCommands = state.JackOutputCommands || [];

// Fix AI Dungeon Bug where AI returns something funny
globalThis.text ??= "";
text = ((typeof text === "string") && text) || "\n";

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

// === Jack Preprocessor - Top
function JackPreprocessor(text) {
  text = JackPreprocessorInit(text);
  text = formatAuthorsNote(text);
  text = JackPreprocessDirectives(text);

  // Handle #next
  if (state.JackDefsMap.hasOwnProperty("NEXT")) {
    let guidance = "\n[Guidance for continuation: " + state.JackDefsMap.NEXT + "]\n";
    text += guidance;
    JackLog(LOG_STORY, guidance);
  }
  return text;
}

function removeSystemBlocks(input) {
    let result = input;
    const innerMost = /<SYSTEM>[^<]*(?:(?!<SYSTEM>|<\/SYSTEM>)[\s\S])*?<\/SYSTEM>/g;
    while (innerMost.test(result)) {
      result = result.replace(innerMost, '');
    }
    return result;
  }
  
function formatAuthorsNote(text) {
    return text.replace(/\[Author's note:\s*([\s\S]*?)\]/g, (match, content) => {
        // Insert linefeed after opening and before closing
        return "[Author's note:\n" + content.trimEnd() + "\n]";
    });
}
  
// === Initialization ===
function JackPreprocessorInit(text) {
  // Remove any SYSTEM-messages
  text = removeSystemBlocks(text);
  // Reset Variables
  state.debugOutput = "";
  // Delete Variables
  if (state.JackDefsMap.DEBUG) delete state.JackDefsMap.DEBUG;
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
  state.JackDefsNamespace = "";
  const lines = (text || "").split(/\r?\n/);
  const out = [];
  const active = [true];
  const branchTaken = [];

  for (let line of lines) {
    let rawLine = line;
    let t = line;
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
      case "#front_memory": {
        if (!parent) break;
        let data = stripQuotes(JackEvalValue(rest.trim()));
        state.memory.frontMemory = data;
        JackLog(LOG_STORY, "state.memory.frontMemory <- " + data);
        break;
      }
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
      case "#append":
      case "#scene":
      case "#fact":
      case "#ask":
      case "#asking": {
        JackLog(LOG_ERROR, "Directive " + directive + " is not supported by Lite-version.");
        break;
      }
      default: {
        JackLog(LOG_ERROR, "Unknown directive: " + directive + " " + rest);
        break;
      }
    }
  }
  text = out.join("\n").trim();
  return text;
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
// === Built-in Functions
function JackEvalSpecial(token) {
  token = token.trim();
  // TOLZ(text)
  let m = token.match(/^TOLZ\s*\((.+)\)$/i);
  if (m) {
    JackLog(LOG_ERROR, "TOLZ() is not suported by Lite-version.");
  }
  // LZ(compressed)
  m = token.match(/^LZ\s*\((.+)\)$/i);
  if (m) {
    JackLog(LOG_ERROR, "LZ() is not suported by Lite-version.");
  }
  // TOREGEX(text, flags)
  m = token.match(/^TOREGEX\s*\(([^,]+)(?:,\s*([^)]+))?\)$/i);
  if (m) {
    JackLog(LOG_ERROR, "TOLREGEX() is not suported by Lite-version.");
  }
  // REGEX(string, pattern)
  m = token.match(/^REGEX\s*\(([^,]+),\s*(.+)\)$/i);
  if (m) {
    JackLog(LOG_ERROR, "REGEX() is not suported by Lite-version.");
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
  return token;
}
// ======================================================
// === AI asking (#ask/#asking/#refresh)
// Not supported by Lite version
function JackAskAiQuestion(text) {
  return text;
}
function JackThereIsActiveAiQuestion() {
  return false;
}
function JackCatchAiAnswer(text) {
  return text;
}
// ======================================================
// === Debug / Logging Functions
function JackLog(type, text) {
  switch (type) {
    case LOG_ERROR: {
      if (state.verboseLevel >= LOG_ERROR) {
        state.message = text;
        state.debugOutput += "ERROR: " + text + "\n";
      }
      break;
    }
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
// ======================================================
// === Output Handling (#OUT/#OUTPUT/#DEBUG)
function JackAddOutputCommand(cmd, arg1, arg2) {
  const valid = ["prepend", "append", "clear"];
  if (valid.indexOf(cmd) !== -1) {
    state.JackOutputCommands.push({ cmd: cmd, arg1: arg1, arg2: arg2 });
  }
}
// === Output-hook function to process #OUTPUT directive ===
function JackOutputProcess(text) {  
    while (state.JackOutputCommands.length > 0) {
        var c = state.JackOutputCommands.shift();
        var cmd = c.cmd, arg1 = c.arg1 || "", arg2 = c.arg2 || "";

        if (cmd === "prepend") {
            text = arg2 + arg1 + arg2 + text;
        }
        else if (cmd === "append") {
            text = text + arg2 + arg1 + arg2;
        } else if (cmd === "clear") {
            text = "";
        }
        else {
            JackLog(LOG_ERROR, "Error: " + cmd + "-cmd in #out/#output not supported by Lite version.");
        }
    }
  state.lastOutput = text;
  if (state.lastInput) state.lastInput = "";
  let sysOut = "";
  if (state.debugOutput) {sysOut += "\ndebugOutput:\n" + state.debugOutput + "\n";}
  let dbg = JackGetUserDebug();
  if (dbg) {sysOut += "\n#DEBUG directives:\n" + dbg + "\n";}
  if (state.verboseLevel >= LOG_VAR) {
    sysOut += "\nUser Variables:\n" + JackDumpDefs(state.JackDefsMap) + "\n";
  }
  if (state.verboseLevel >= LOG_VERSION) {
    sysOut += "\nJP-Version: " + VERSION + " (Reduced version)";
    if (state.verboseLevel == LOG_VERSION) state.verboseLevel = state.verboseLevel - 1;
    else sysOut += "\nNote: /debug on (disable these with /debug off)";
  }
  if (sysOut) {text += "\n<SYSTEM>\n" + sysOut + "\n</SYSTEM>\n";}
  delete state.JackDefsMap.USER_INPUT;
  return text;
}
