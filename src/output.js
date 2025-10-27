// NOTE: Adding this file is optional
//
// Needed for:
// - /debug and for #OUTPUT and #DEBUG directives
// - #ASK/#ASKING directives

// === OUTPUT-hook (data sent to user output) ===
const modifier = (text) => {
/*
  // Optional: LewdLeah Auto-Cards
  if (!JackThereIsActiveAiQuestion()) {
    text = AutoCards("output", text);
  }
*/
  // Needed to support #ASK and #REFRESH directives
  // - AI answer expected on input
  // - Returns sometimes "< click continue >"
  //   but mostly unmodified input text. 
  text = JackCatchAiAnswer(text);

  // Needed for /debug and for #OUTPUT and #DEBUG directives
  text = JackOutputProcess(text);
  
  return {text};
}
modifier(text);
