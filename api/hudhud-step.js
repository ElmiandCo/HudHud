import { routeTool, detectTool } from "./tool-router.js";
import { getAuthenticatedUser, buildHudHudContext, contextPrompt } from "../lib/hudhud-context.js";

async function callBrain(message){
  const brainUrl=String(process.env.HUDHUD_BRAIN_URL||"").trim();
  if(!brainUrl)throw new Error("HudHud brain is not configured.");
  const response=await fetch(brainUrl,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      ...(process.env.HUDHUD_BRAIN_TOKEN?{Authorization:`Bearer ${process.env.HUDHUD_BRAIN_TOKEN}`}:{})
    },
    body:JSON.stringify({message})
  });
  const raw=await response.text();
  let data;try{data=JSON.parse(raw)}catch{data={reply:raw}};
  if(!response.ok)throw new Error(`Brain connection returned HTTP ${response.status}.`);
  return data.reply||data.choices?.[0]?.message?.content||"";
}

function bearer(req){
  return String(req.headers.authorization||"").replace(/^Bearer\s+/i,"").trim();
}

export default async function handler(req,res){
  if(req.method!=="POST"){
    res.setHeader("Allow","POST");
    return res.status(405).json({error:"Method not allowed."});
  }
  try{
    const token=bearer(req);
    const user=await getAuthenticatedUser(token);
    const context=await buildHudHudContext(token,user.id);
    const body=req.body||{};
    const project=body.project||{};
    const step=body.step||{};
    const connections=Array.isArray(body.connections)?body.connections:[];
    if(!step.name)return res.status(400).json({error:"Step is required."});

    const resourceLines=connections.map(c=>{
      const settings=c.settings||{};
      const selected=Array.isArray(settings.resources)?settings.resources.join(", "):"all configured resources";
      return `- ${c.provider||c.name}: ${selected}`;
    }).join("\n")||"- No external connection selected.";

    const task=[
      contextPrompt(context),
      "",
      `You are HudHud executing one project step for authenticated user ${user.id}.`,
      `Project: ${project.name||"Untitled"}`,
      `Project goal: ${project.description||"No description"}`,
      `Step: ${step.name}`,
      `Step prompt: ${step.prompt||step.name}`,
      "Authorized connection scope for this step:",
      resourceLines,
      "Complete the step using the available tool context when possible. Be concise. If a tool result is supplied, summarize what happened and what remains."
    ].join("\n");

    let toolRun=null;
    const detected=detectTool(task);
    if(detected){
      try{toolRun={tool:detected.tool,args:detected.args,result:await routeTool(detected.tool,detected.args)}}
      catch(error){toolRun={tool:detected.tool,error:error.message}}
    }

    const finalPrompt=toolRun?.result
      ?task+"\n\nLIVE TOOL RESULT:\n"+JSON.stringify(toolRun.result).slice(0,12000)
      :toolRun?.error
        ?task+"\n\nLIVE TOOL ERROR:\n"+toolRun.error
        :task;

    const reply=await callBrain(finalPrompt);
    if(toolRun?.error)return res.status(503).json({completed:false,reply:reply||"The requested tool could not complete the step.",tool:toolRun.tool,error:toolRun.error});
    return res.status(200).json({completed:true,reply:reply||"Step completed.",tool:toolRun?.tool||null,toolResult:toolRun?.result||null});
  }catch(error){
    const message=error?.message||"HudHud could not execute the step.";
    return res.status(/Authentication/i.test(message)?401:503).json({completed:false,error:message});
  }
}