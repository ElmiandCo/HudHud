import { routeTool, detectTool } from "./tool-router.js";
import { getAuthenticatedUser, buildHudHudContext, contextPrompt } from "../lib/hudhud-context.js";

async function runToolIfRequested(message,contextUserId){
  const detected=detectTool(message);
  if(!detected)return null;
  try{return{tool:detected.tool,args:detected.args,result:await routeTool(detected.tool,detected.args,{userId:contextUserId})}}
  catch(error){return{tool:detected.tool,args:detected.args,error:error.message}}
}

function bearer(req){
  return String(req.headers.authorization||"").replace(/^Bearer\s+/i,"").trim();
}

export default async function handler(req,res){
  if(req.method!=="POST"){
    res.setHeader("Allow","POST");
    return res.status(405).json({error:"Method not allowed"});
  }

  const message=typeof req.body?.message==="string"?req.body.message.trim():"";
  if(!message)return res.status(400).json({error:"Message is required."});
  if(message.length>4000)return res.status(400).json({error:"Message is too long."});

  try{
    const token=bearer(req);
    const user=await getAuthenticatedUser(token);
    const context=await buildHudHudContext(token,user.id);

    const toolRun=await runToolIfRequested(message,user.id);
    if(toolRun){
      if(toolRun.error)return res.status(503).json({error:`HudHud ${toolRun.tool} tool: ${toolRun.error}`,tool:toolRun.tool});
      const compact=JSON.stringify(toolRun.result);
      return res.status(200).json({
        reply:`I used the ${toolRun.tool} connection. Here is the live result:\n\n${compact.slice(0,12000)}`,
        tool:toolRun.tool,
        toolResult:toolRun.result
      });
    }

    const brainMessage=[contextPrompt(context),"","CURRENT USER MESSAGE:",message].join("\\n");
    // Prefer an explicitly configured private gateway; otherwise use OpenAI directly.
    const brainUrl=process.env.HUDHUD_BRAIN_URL;
    if(brainUrl){
      const response=await fetch(brainUrl,{
        method:"POST",headers:{"Content-Type":"application/json",...(process.env.HUDHUD_BRAIN_TOKEN?{Authorization:`Bearer ${process.env.HUDHUD_BRAIN_TOKEN}`}:{})},
        body:JSON.stringify({message:brainMessage}),signal:AbortSignal.timeout(25000)
      });
      const raw=await response.text();let data;
      try{data=JSON.parse(raw)}catch{data={reply:raw}}
      if(!response.ok)return res.status(502).json({error:`Brain connection returned HTTP ${response.status}.`});
      return res.status(200).json({reply:data.reply||data.choices?.[0]?.message?.content||"",contextLoaded:true,provider:"gateway"});
    }
    const apiKey=process.env.OPENAI_API_KEY;
    if(!apiKey)return res.status(503).json({error:"OpenAI is not configured. Add OPENAI_API_KEY to this Vercel project."});
    const response=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      headers:{"Content-Type":"application/json",Authorization:`Bearer ${apiKey}`},
      body:JSON.stringify({model:process.env.HUDHUD_OPENAI_MODEL||"gpt-4.1-mini",instructions:"You are HudHud, a helpful, accurate AI assistant in HudHud HQ. Do not claim to have changed systems unless a tool has actually run. Be concise. Never reveal credentials.",input:brainMessage,max_output_tokens:650,store:false}),
      signal:AbortSignal.timeout(25000)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      console.error("HudHud OpenAI request failed",response.status,data?.error?.code||"unknown");
      return res.status(response.status===429?429:502).json({error:response.status===429?"AI usage limit reached. Try again later.":"OpenAI request failed. Check API model access and billing."});
    }
    const reply=(data.output||[]).flatMap(item=>(item.content||[]).filter(part=>part.type==="output_text").map(part=>part.text)).join("\\n").trim();
    if(!reply)return res.status(502).json({error:"OpenAI returned no message."});
    return res.status(200).json({reply,contextLoaded:true,provider:"openai"});
  }catch(error){
    const messageText=error?.message||"HudHud could not process the request.";
    return res.status(/Authentication/i.test(messageText)?401:503).json({error:messageText});
  }
}