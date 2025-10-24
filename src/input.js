// NOTE: Adding this file is optional
// - it only includes user commands for deeper debug.

// Supported commands (case-insensitive):
//   /debug on          → enable debug mode
//   /debug off         → disable debug mode
//   /debug deep        → deep debug mode (a lot)
//   /debug simple      → "/debug on" alias
//   /debug KEY=VALUE   → define KEY with VALUE
//   /debug KEY=null    → undefine KEY
function JackCmdCheck(text) {
    
    // Avoid executing commands from intro texts.
    if (info.actionCount < 2) return text;

    // Case insensitive
    let lower = text.toLowerCase();

    // Do not process commands within SYSTEM messages.
    //lower = lower.replace(/<SYSTEM>[\s\S]*?<\/SYSTEM>/g, '');

    if (lower.includes("/debug off")) {
        state.verboseLevel = LOG_SYS_ERROR;
        //state.lastOutput = state.lastOutput.replace(/<SYSTEM>[\s\S]*?<\/SYSTEM>/g, '').trim();
    } else if (lower.includes("/debug on")) {
        state.verboseLevel = LOG_STORY;
    } else if (lower.includes("/debug deep")) {
        state.verboseLevel = LOG_CONTEXT;
    } else if (lower.includes("/debug simple")) {
        state.verboseLevel = LOG_VAR;
    } else if (lower.includes("/log off")) {
        state.verboseLevel = LOG_OFF;
    } else if (lower.includes("/log error")) {
        state.verboseLevel = LOG_ERROR;
    } else if (lower.includes("/version")) {
        state.verboseLevel = LOG_VERSION;
    }

    // Match generic "/debug key=value"
    let match = lower.match(/\/debug\s+([A-Za-z0-9_]+)\s*=\s*([^\s]+)/i);
    if (match) {
        let key = match[1];
        let value = match[2];

        if (/^null$/i.test(value)) {
            delete state.JackDefsMap[key];
        } else {
            state.JackDefsMap[key] = value;
        }
    }

    // Return same input, after removing commands
    return text.split(/\/debug /i)[0].trim();
}

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

// === INPUT-hook (data from user input) ===
const modifier = (text) => {

    // Optional: Only needed for deeper debug
    // (#debug-primitive works even without this)
    text = JackCmdCheck(text);

    // Optional: Used for input-modify primitives
    // Used by #user_success/#user_fail/#user_trusted/#user_suspicious
    text = JackAppendSuccessInfo(text);

    // Optional: Store input to be available in {INPUT}
    state.lastInput = text;

    return {text};
}
modifier(text);
