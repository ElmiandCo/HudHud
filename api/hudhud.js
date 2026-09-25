import { routeTool, detectTool } from "./tool-router.js";
import { getAuthenticatedUser, buildHudHudContext, contextPrompt } from "../lib/hudhud-context.js";

async function runToolIfRequested(message){
  const detected=detectTool(message);
  if(!detected)return null;
  try{return{tool:detected.tool,args:detected.args,result:await routeTool(detected.tool,detected.args)}}
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

  try{
    const token=bearer(req);
    const user=await getAuthenticatedUser(token);
    const context=await buildHudHudContext(token,user.id);

    const toolRun=await runToolIfRequested(message);
    if(toolRun){
      if(toolRun.error)return res.status(503).json({error:`HudHud ${toolRun.tool} tool: ${toolRun.error}`,tool:toolRun.tool});
      const compact=JSON.stringify(toolRun.result);
      return res.status(200).json({
        reply:`I used the ${toolRun.tool} connection. Here is the live result:\n\n${compact.slice(0,12000)}`,
        tool:toolRun.tool,
        toolResult:toolRun.result
      });
    }

    const brainUrl=process.env.HUDHUD_BRAIN_URL;
    if(!brainUrl)return res.status(503).json({error:"HudHud is online, but no server-side brain connection is configured yet."});

    const brainMessage=[
      contextPrompt(context),
      "",
      "CURRENT USER MESSAGE:",
      message
    ].join("\n");

    const response=await fetch(brainUrl,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        ...(process.env.HUDHUD_BRAIN_TOKEN?{Authorization:`Bearer ${process.env.HUDHUD_BRAIN_TOKEN}`}:{})
      },
      body:JSON.stringify({message:brainMessage})
    });

    const raw=await response.text();
    let data;
    try{data=JSON.parse(raw)}catch{data={reply:raw}}
    if(!response.ok)return res.status(502).json({error:`Brain connection returned HTTP ${response.status}.`});

    return res.status(200).json({
      reply:data.reply||data.choices?.[0]?.message?.content||"",
      contextLoaded:true
    });
  }catch(error){
    const messageText=error?.message||"HudHud could not process the request.";
    return res.status(/Authentication/i.test(messageText)?401:503).json({error:messageText});
  }
}