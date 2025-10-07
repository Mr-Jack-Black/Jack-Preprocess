// === Global variables ===
const VERSION = "v0.6.1-alpha";

// Not required by the library
state.lastContext = state.lastContext || '';
state.lastInput = state.lastInput || '';
state.lastOutput = state.lastOutput || '';
state.debugMode = state.debugMode || false;
state.deepDebugMode = state.deepDebugMode || false;

// Required variables
state.debugOutput = state.debugOutput || '';
state.JackDefsMap = state.JackDefsMap || { TURN: "-1", DEBUG: "", DEBUG_ON: "true" };
state.JackDefsNamespace = state.JackDefsNamespace || '';

// AI Questions
state.JackAiQuestions = state.JackAiQuestions || {};
state.JackAiQuestionID = state.JackAiQuestionID || "";
state.lastAiAnswer = state.lastAiAnswer || '';
state.JackAiAnswerChoices = state.JackAiAnswerChoices || "";

// Provide INPUT and OUTPUT variables initialized from state
state.JackDefsMap.INPUT = state.lastInput || '';
state.JackDefsMap.OUTPUT = state.lastOutput || '';

// Output processing
state.JackOutputCommands = state.JackOutputCommands || [];

// Comment handling
state.JackRemoveCommentedLines = state.JackRemoveCommentedLines || false;
state.JackInBlockComment = state.JackInBlockComment || false;

// Fix AI Dungeon Bug where AI returns something funny
globalThis.text ??= "";
if (typeof text === "number") text = text.toString();
text = ((typeof text === "string") && text) || "\n";

// === Expected type prompts ===
const JACK_PROMPT_BOOL   = "Answer only with '0' for false/no or '1' for true/yes.";
const JACK_PROMPT_INT    = "Answer only with a single integer number.";
const JACK_PROMPT_STRING = "Answer only with the exact string, nothing else.";
const CONTINUE_MSG       = "\n< Please click continue >\n";

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
      ready: false
    };
  } else {
    state.JackAiQuestions[ID].question = question;
    state.JackAiQuestions[ID].expect = expect;
    state.JackAiQuestions[ID].ready = false;
  }
  if (choices) {
    state.JackAiAnswerChoices = "[" + choices.join(",") + "]";
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
      else if (q.expect === "name") prompt = "Answer only with a 1–2 word proper name (each word capitalized).";
      else if (state.JackAiAnswerChoices) prompt = "Answer only with one of: " + state.JackAiAnswerChoices;
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

// === Catch and process answer ===
function JackCatchAiAnswer(text) {
  let ID = state.JackAiQuestionID;
  if (!ID) {
    // No active question, just pass through the story text
    return text;
  }

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

    if (state.JackAiAnswerChoices) {
      let choices = state.JackAiAnswerChoices.slice(1, -1).split(",").map(s => s.trim());
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
      state.JackAiAnswerChoices = "";
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
  out += "Cooldown=" + JackGetCooldown() + ", ActiveID=" + state.JackAiQuestionID;
  if (JackGetCooldown() > 0) out += " (cooling down)";
  out += "\n";
  for (let ID in state.JackAiQuestions) {
    let q = state.JackAiQuestions[ID];
    out += ID + " => { question: \"" + q.question + "\", expect: " + q.expect + ", answer: \"" + q.answer + "\", ready: " + q.ready + " }\n";
    out += "Full Answer:\n" + state.lastAiAnswer + "\n";
  }
  return out;
}

// === Helper: evaluate special functions used in conditions or { ... } sequences ===
function JackEvalSpecial(token) {
  token = token.trim();

  // TOREGEX(text, flags)
  m = token.match(/^TOREGEX\s*\(([^,]+)(?:,\s*([^)]+))?\)$/i);
  if (m) {
    let txt = stripQuotes(JackApplyMacros(m[1].trim()));
    let flg = m[2] ? stripQuotes(JackApplyMacros(m[2].trim())) : "";
    return "/" + txt + "/" + flg;
  }

  // REGEX(string, pattern)
  let m = token.match(/^REGEX\s*\(([^,]+),\s*(.+)\)$/i);
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

  // P(15%) or P(0.15) or P({A})
  m = token.match(/^P\s*\(([^)]+)\)$/i);
  if (m) {
    let arg = JackApplyMacros(m[1].trim());
    arg = stripQuotes(arg);
    if (/^(\d+)%$/.test(arg)) {
      let pct = parseInt(RegExp.$1,10);
      return (Math.random()*100 < pct) ? "1" : "0";
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
    let a = parseInt(JackApplyMacros(m[1].trim()),10);
    let b = parseInt(JackApplyMacros(m[2].trim()),10);
    if (isNaN(a) || isNaN(b)) return "";
    if (a > b) { let t=a;a=b;b=t; }
    return String(Math.floor(Math.random()*(b - a + 1)) + a);
  }

  // SELECT(N,[A,B,C])
  m = token.match(/^SELECT\s*\(([^,]+),\s*\[(.*)\]\)$/i);
  if (m) {
    let idxRaw = JackApplyMacros(m[1].trim());
    let idx = parseInt(idxRaw,10);
    if (isNaN(idx)) return "";
    let list = m[2].split(/,\s*/).map(x=>stripQuotes(JackApplyMacros(x.trim())));
    if (list.length === 0) return "";
    if (idx < 1 || idx >= (list.length + 1)) return "";
    return list[idx-1];
  }

  // simple numeric/string fallback
  return token;
}

function stripQuotes(s) {
  if (typeof s !== 'string') return s;
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1,-1);
  return s;
}

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
              text = text.replace(regex, function(match) {
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

  // Collect debug info
  let dbg = JackGetUserDebug();
  let sysOut = "";

  if (dbg) {
    sysOut += "=== #DEBUG directives ===\n" + dbg + "\n";
  }

  if (state.deepDebugMode) {
    sysOut += "=== /debug on (disable these with /debug off) ===\n";
    sysOut += "JP-Version: " + VERSION + "\n";
    sysOut += "info.actionCount = " + info.actionCount +
              state.debugOutput +
              "Defines: \n" + JackDumpDefs(state.JackDefsMap) + "\n" +
              JackAiQuestionsDump() +
              "\nCONTEXT_HOOK:\n" + state.lastContext + "\n";
              state.lastOutput = state.lastOutput.replace(/<SYSTEM>[\s\S]*?<\/SYSTEM>/g, '').trim();
  } else if (state.debugMode) {
    sysOut += "=== /debug on (disable these with /debug off) ===\n";
    sysOut += "JP-Version: " + VERSION + "\n";
    sysOut += "info.actionCount = " + info.actionCount +
              state.debugOutput +
              "Defines:\n" + JackDumpDefs(state.JackDefsMap) + "\n" +
              JackAiQuestionsDump() + "\n";
              state.lastOutput = state.lastOutput.replace(/<SYSTEM>[\s\S]*?<\/SYSTEM>/g, '').trim();
  }

  if (sysOut) {
    text += "\n<SYSTEM>\n" + sysOut + "</SYSTEM>\n";
  }

  return text;
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


// === Preprocess context text ===
function JackPreprocess(text) {

  // Remove any SYSTEM-messages
  text = text.replace(/<SYSTEM>[\s\S]*?<\/SYSTEM>/g, '');
  state.JackDefsNamespace = "";

  const lines = (text || "").split(/\r?\n/);
  const authorsNotePattern = /^\[Author's note:\s*/i;
  const out = [];
  const active = [true];

  // reset DEBUG each run
  state.JackDefsMap.DEBUG = "";

  // TURN increment
  let cur = parseInt(state.JackDefsMap.TURN, 10);
  if (isNaN(cur)) cur = -1;
  state.JackDefsMap.TURN = String(cur + 1);

  // check NEXT expiration
  if (state.JackDefsMap.TURNXT && parseInt(state.JackDefsMap.TURN, 10) >= parseInt(state.JackDefsMap.TURNXT, 10)) {
    delete state.JackDefsMap.NEXT;
    delete state.JackDefsMap.TURNXT;
  }

  for (let line of lines) {

    let rawLine = line;
    let t = line;

    // Handle block comments if enabled
    if (state.JackRemoveCommentedLines) {
      if (state.JackInBlockComment) {
        if (t.includes("*/")) {
          state.JackInBlockComment = false;
        }
        continue; // TODO: Not handling text after block comment end.
      }
      if (/^\s*\/\//.test(t)) continue; // skip single line comment
      if (/^\s*\/\*/.test(t)) {
        if (!t.includes("*/")) {
          state.JackInBlockComment = true;
          continue;
        } else {
          continue; // skip /* ... */ single-line block
        }
      }
    }

    let authorsMatch = rawLine.match(authorsNotePattern);
    let authorsPrefix = authorsMatch ? authorsMatch[0] : null;
    if (authorsPrefix) t = rawLine.slice(authorsPrefix.length);

    t = t.trim();
    if (!t.startsWith("#")) {
      if (active[active.length - 1]) out.push(JackApplyMacros(rawLine));
      continue;
    }

    const [directiveRaw, ...restArr] = t.split(/\s+/);
    const directive = (directiveRaw || "").toLowerCase();
    const rest = restArr.join(" ");
    const parent = active[active.length - 1];

    switch (directive) {
      case "#begin": {
        state.JackRemoveCommentedLines = true;
        state.JackInBlockComment = false;
        state.JackDefsNamespace = "";
        break;
      }
      case "#end": {
        state.JackRemoveCommentedLines = false;
        state.JackInBlockComment = false;
        state.JackDefsNamespace = "";
        break;
      }
      case "#define":
      case "#set": {
        if (!parent) break;
        const m = rest.match(/^([A-Za-z0-9_:.]+)(?:\s+(.*))?$/s);
        if (m) {
          let key = JackResolveKey(m[1]);
          let val = m[2] || "";
          val = stripQuotes(JackEvalValue(val.trim()));
          state.JackDefsMap[key] = val;
          state.debugOutput += key + " <- " + val + "\n";
        }
        break;
      }
      case "#namespace": {
        if (!parent) break;
        let ns = stripQuotes(rest.trim());
        if (!ns || /^global$/i.test(ns)) ns = "";
        state.JackDefsNamespace = ns;
        state.debugOutput += "NAMESPACE <- " + ns + "\n";
        break;
      }
      case "#undef": {
        if (!parent) break;
        //let key = rest.split(/\s+/)[0];
        let key = JackResolveKey(rest.split(/\s+/)[0]);
        delete state.JackDefsMap[key];
        state.debugOutput += key + " <- undefined\n";
        break;
      }
      case "#ifdef": {
        //let key = rest.split(/\s+/)[0];
        let key = JackResolveKey(rest.split(/\s+/)[0]);
        active.push(parent && state.JackDefsMap.hasOwnProperty(key));
        break;
      }
      case "#ifndef": {
        //let key = rest.split(/\s+/)[0];
        let key = JackResolveKey(rest.split(/\s+/)[0]);
        active.push(parent && !state.JackDefsMap.hasOwnProperty(key));
        break;
      }
      case "#if": {
        active.push(parent && JackCheckCondition(rest));
        break;
      }
      case "#elif": {
        if (active.length > 1) {
          let prev = active.pop();
          const prev_parent = active[active.length - 1];
          active.push(prev_parent && !prev && JackCheckCondition(rest));
        }
        break;
      }
      case "#else": {
        if (active.length > 1) {
          let prev = active.pop();
          const prev_parent = active[active.length - 1];
          active.push(prev_parent && !prev);
        }
        break;
      }
      case "#endif": {
        if (active.length > 1) active.pop();
        out.push(rest);
        break;
      }
      case "#out":
      case "#output": {
        if (!parent) break;
        let m = rest.match(/^(\S+)(?:\s+(\S+))?(?:\s+(\S+))?/);
        if (m) {
          let cmd = m[1];
          let arg1 = m[2] ? stripQuotes(JackEvalValue(m[2])) : "";
          let arg2 = m[3] ? stripQuotes(JackEvalValue(m[3])) : "";
          JackAddOutputCommand(cmd, arg1, arg2);
        } else {
          state.debugOutput += "Invalid #OUTPUT format: " + rest + "\n";
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
          if (!["bool","int","string","none","name"].includes(expect)) expect = "string";
          if (!(expect === "none" && state.JackDefsMap.hasOwnProperty(key))) JackAddAiQuestion(key, question, expect, choices);
          if (directive === "#asking" && state.JackAiQuestions[key]) state.JackAiQuestions[key].ready = false;
        } else {
          state.debugOutput += "Invalid #ASK format: " + rest + "\n";
        }
        break;
      }
      case "#refresh": {
        if (!parent) break;
        //let key = rest.split(/\s+/)[0];
        let key = JackResolveKey(rest.split(/\s+/)[0]);
        if (state.JackAiQuestions[key]) {
          state.JackAiQuestions[key].ready = false;
          state.debugOutput += "#REFRESH cleared ready for " + key + "\n";
        }
        break;
      }
      case "#append": {
        if (!parent) break;
        const m = rest.match(/^([A-Za-z0-9_]+)\s+(.*)$/s);
        if (m) {
          let key = JackResolveKey(m[1]), val = stripQuotes(JackEvalValue(m[2].trim()));
          state.JackDefsMap[key] = (state.JackDefsMap[key] || "") + val;
          state.debugOutput += key + " appended " + val + "\n";
        }
        break;
      }
      case "#debug": {
        if (!parent) break;
        if (state.JackDefsMap["DEBUG_OFF"] === undefined) {
          let val = stripQuotes(JackEvalValue(rest.trim()));
          state.JackDefsMap.DEBUG += val + "\n";
          state.debugOutput += "DEBUG += " + val + "\n";
        }
        break;
      }
      case "#debug_off": {
        if (!parent) break;
        state.JackDefsMap["DEBUG_OFF"] = "Debug disabled";
        break;
      }
      case "#debug_disable": {
        state.JackDefsMap["DEBUG_OFF"] = "Debug disabled";
        break;
      }
      case "#debug_on": {
        if (!parent) break;
        delete state.JackDefsMap["DEBUG_OFF"];
        break;
      }
      case "#debug_enable": {
        state.JackDefsMap["DEBUG_OFF"] = "Debug disabled";
        break;
      }
      case "#next": {
        if (!parent) break;
        const m = rest.match(/^(?:\((\d+)\)\s+)?(.*)$/s);
        if (m) {
          let delay = m[1] ? parseInt(m[1],10) : null;
          let data = stripQuotes(JackEvalValue(m[2].trim()));
          state.JackDefsMap.NEXT = data;
          if (delay !== null) {
            state.JackDefsMap.TURNXT = String(parseInt(state.JackDefsMap.TURN,10) + delay);
          }
          state.debugOutput += "NEXT <- " + data + (delay!==null ? " with delay "+delay : "") + "\n";
        }
        break;
      }
      case "#scene": {
        if (!parent) break;
        let data = stripQuotes(JackEvalValue(rest.trim()));
        state.JackDefsMap.SCENE = data;
        state.debugOutput += "SCENE <- " + data + "\n";
        break;
      }
    }
    if (authorsPrefix && parent && active[active.length - 1]) out.push(authorsPrefix.trim());
  }

  if (state.JackDefsMap.hasOwnProperty("NEXT")) {
    let guidance = state.JackDefsMap.NEXT;
    if (state.JackDefsMap.hasOwnProperty("SCENE") && state.JackDefsMap.SCENE) {
      guidance = state.JackDefsMap.SCENE + "\n" + guidance;
    }
    out.push("[AI guidance for continuation: " + guidance + " ]");
  }

  /* TODO: check unbalanced condition stack
  if (active.length !== 1) {
    let err = "Unbalanced directives: missing #endif (depth=" + (active.length-1) + ")\n";
    state.debugOutput += err;
    state.JackDefsMap.DEBUG += err;
  }*/

  text = out.join("\n") 

  // Updating context in case user doesn't do this.
  state.lastContext = text;

  return text;
}

// === Macro substitution and special { ... } evaluation ===
function JackApplyMacros(text) {
  return String(text).replace(/\{([^}]+)\}/g,(m,inner)=>{
    inner = inner.trim();
    // variable
    //if (/^[A-Za-z0-9_]+$/.test(inner)) {
    //  return state.JackDefsMap.hasOwnProperty(inner) ? state.JackDefsMap[inner] : m;
    //}
    if (/^[A-Za-z0-9_:.]+$/.test(inner)) {
      let key = JackResolveKey(inner);
      return state.JackDefsMap.hasOwnProperty(key) ? state.JackDefsMap[key] : m;
    }
    // special functions or expressions
    try {
      let special = JackEvalSpecial(inner);
      // if special returns same token (no match), try numeric expression
      if (special === inner) {
        // numeric eval fallback
        let exp = inner.replace(/\b([A-Za-z0-9_]+)\b/g,(kk)=> state.JackDefsMap.hasOwnProperty(kk)?state.JackDefsMap[kk]:kk);
        try { let r = eval(exp); if (typeof r === 'number' && !isNaN(r)) return String(r); } catch(e){}
        return special;
      }
      return special;
    } catch (e) {
      state.debugOutput += "Macro eval error: " + e.message + "\n";
      return m;
    }
  });
}

// === Condition evaluation ===
function JackCheckCondition(expr) {
  try {
    expr = JackApplyMacros(expr);
    // replace remaining known defines
    for (let k in state.JackDefsMap) expr = expr.replace(new RegExp("\\b"+k+"\\b","g"), state.JackDefsMap[k]);
    // evaluate special function calls in the expression (like P(15%), RND(...), INCLUDES(), REGEX())
    expr = expr.replace(/\b(REGEX|INCLUDES|P|RND|SELECT)\s*\([^)]*\)/g, (m)=> JackEvalSpecial(m));
    return !!eval(expr);
  } catch(e) {
    state.debugOutput += "Cond error: " + e.message + "\n";
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
  } catch(e){}
  return expanded;
}

// === Dump defines ===
function JackDumpDefs() {
  return Object.entries(state.JackDefsMap).map(([k,v])=>k+"="+v).join(", ");
}

// === Get DEBUG value ===
function JackGetUserDebug() {
  return state.JackDefsMap.DEBUG || "";
}
