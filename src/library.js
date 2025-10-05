// === Global variables ===

// Not required by the library
state.lastContext = state.lastContext || '';
state.lastInput = state.lastInput || '';
state.lastOutput = state.lastOutput || '';
state.debugMode = state.debugMode || false;
state.deepDebugMode = state.deepDebugMode || false;

// Required variables
state.debugOutput = state.debugOutput || '';
state.JackDefsMap = state.JackDefsMap || { TURN: "-1", DEBUG: "" }; // DEBUG predefined

// AI Questions
state.JackAiQuestions = state.JackAiQuestions || {};
state.JackAiQuestionID = state.JackAiQuestionID || "";
state.lastAiAnswer = state.lastAiAnswer || '';

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
function JackAddAiQuestion(ID, question, expect) {
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
      else prompt = JACK_PROMPT_STRING;
      text += `\n<SYSTEM>Ignore all previous instructions and answer only the following question clearly and simply: ${q.question}. ${prompt}</SYSTEM>\n`;
      state.lastAiAnswer = "";
      return text; 
    }
  }
  return text;
}

// === Catch and process answer ===
function JackCatchAiAnswer(text) {
  let cleared = false;
  let ID = state.JackAiQuestionID;
  if (ID) {
    state.JackAiQuestionID = "";
    cleared = true;
    text = String(text || "").replace(CONTINUE_MSG, '').trim();

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
        if (matches && matches.length === 1) {
          parsed = matches[0];
          valid = true;
        }
      } else if (q.expect === "string") {
        let cleaned = ans.replace(/<[^>]*>/g, "").trim();
        if (cleaned.length > 0) {
          parsed = cleaned;
          valid = true;
        }
      }

      if (valid) {
        q.answer = parsed;
        q.ready = true;
        if (q.expect === "none") {
          if (!state.JackDefsMap.hasOwnProperty(ID) && parsed === "1") {
            state.JackDefsMap[ID] = "1";
          }
        } else {
          state.JackDefsMap[ID] = parsed;
        }
        state.debugOutput += ID + " <- " + parsed + " (from AI answer)\n";
      } else {
        state.debugOutput += "Invalid AI answer for ID=" + ID + " (" + q.expect + "): " + ans + "\n";
      }
    } else {
      state.debugOutput += "JackCatchAiAnswer: no question entry for ID=" + ID + "\n";
    }
  }
  return cleared ? CONTINUE_MSG : text;
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

// === Preprocess context text ===
function JackPreprocess(input) {
  const lines = (input || "").split(/\r?\n/);
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
      case "#define":
      case "#set": {
        if (!parent) break;
        const m = rest.match(/^([A-Za-z0-9_]+)(?:\s+(.*))?$/);
        if (m) {
          let key = m[1];
          let val = m[2] ? JackEvalValue(m[2]) : (state.JackDefsMap[key] || "");
          state.JackDefsMap[key] = val;
          state.debugOutput += key + " <- " + val + "\n";
        }
        break;
      }
      case "#undef": {
        if (!parent) break;
        let key = rest.split(/\s+/)[0];
        delete state.JackDefsMap[key];
        state.debugOutput += key + " <- undefined\n";
        break;
      }
      case "#ifdef": {
        let key = rest.split(/\s+/)[0];
        active.push(parent && state.JackDefsMap.hasOwnProperty(key));
        break;
      }
      case "#ifndef": {
        let key = rest.split(/\s+/)[0];
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
      case "#ask":
      case "#asking": {
        if (!parent) break;
        const m = rest.match(/^([A-Za-z0-9_]+)\s+"([^"]+)"(?:\s+\((\w+)\))?/);
        if (m) {
          let key = m[1], question = m[2], expect = m[3] ? m[3].toLowerCase() : null;
          if (!expect) {
            if (/^\s*(is|are|was|were|do|does|did|has|have|had|can|could|will|would|should|may|might|shall|am)\b/i.test(question) || /\bor\b/i.test(question)) expect = "none";
            else expect = "string";
          }
          if (!["bool","int","string","none"].includes(expect)) expect = "string";
          if (!(expect === "none" && state.JackDefsMap.hasOwnProperty(key))) JackAddAiQuestion(key, question, expect);
          if (directive === "#asking" && state.JackAiQuestions[key]) state.JackAiQuestions[key].ready = false;
        } else {
          state.debugOutput += "Invalid #ASK format: " + rest + "\n";
        }
        break;
      }
      case "#refresh": {
        if (!parent) break;
        let key = rest.split(/\s+/)[0];
        if (state.JackAiQuestions[key]) {
          state.JackAiQuestions[key].ready = false;
          state.debugOutput += "#REFRESH cleared ready for " + key + "\n";
        }
        break;
      }
      case "#append": {
        if (!parent) break;
        const m = rest.match(/^([A-Za-z0-9_]+)\s+(.*)$/);
        if (m) {
          let key = m[1], val = JackEvalValue(m[2]);
          state.JackDefsMap[key] = (state.JackDefsMap[key] || "") + val;
          state.debugOutput += key + " appended " + val + "\n";
        }
        break;
      }
      case "#debug": {
        if (!parent) break;
        let val = JackEvalValue(rest);
        state.JackDefsMap.DEBUG += val;
        state.debugOutput += "DEBUG += " + val + "\n";
        break;
      }
      case "#next": {
        if (!parent) break;
        const m = rest.match(/^(?:\((\d+)\)\s+)?(.*)$/);
        if (m) {
          let delay = m[1] ? parseInt(m[1],10) : null;
          let data = JackEvalValue(m[2]);
          state.JackDefsMap.NEXT = data;
          if (delay !== null) {
            state.JackDefsMap.TURNXT = String(parseInt(state.JackDefsMap.TURN,10) + delay);
          }
          state.debugOutput += "NEXT <- " + data + (delay!==null ? " with delay "+delay : "") + "\n";
        }
        break;
      }
    }
    if (authorsPrefix && parent && active[active.length - 1]) out.push(authorsPrefix.trim());
  }

  if (state.JackDefsMap.hasOwnProperty("NEXT")) {
    out.push("[AI guidance for continuation: " + state.JackDefsMap.NEXT + " ]");
  }

  return out.join("\n");
}

// === Macro substitution ===
function JackApplyMacros(text) {
  return String(text).replace(/\{([A-Za-z0-9_]+)\}/g,(m,k)=> state.JackDefsMap.hasOwnProperty(k)?state.JackDefsMap[k]:m);
}

// === Condition evaluation ===
function JackCheckCondition(expr) {
  try {
    expr = JackApplyMacros(expr);
    for (let k in state.JackDefsMap) expr = expr.replace(new RegExp("\\b"+k+"\\b","g"), state.JackDefsMap[k]);
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
