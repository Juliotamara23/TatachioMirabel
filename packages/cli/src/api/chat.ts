import { SseChunk } from "../types.js";

export async function* streamChat(
  baseUrl: string,
  token: string,
  message: string,
  model?: string,
): AsyncGenerator<SseChunk> {
  const url = `${baseUrl}/api/chat`;
  
  const headers: HeadersInit = {
    "Authorization": `Bearer ${token}`, 
    "Content-Type": "application/json",
    "Accept": "text/event-stream"
  };
  
  const body = JSON.stringify({ message, model });
  
  const response = await fetch(url, {
    method: "POST",
    headers,
    body,
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  if (!response.body) {
    throw new Error("No response body");
  }
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  
  while (true) {
    const { done, value } = await reader.read();
    
    if (done) {
      break;
    }
    
    buffer += decoder.decode(value, { stream: true });
    
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";
    
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.substring(6).trim();
        
        if (data === "[DONE]") {
          return;
        }
        
        try {
          const chunk = JSON.parse(data) as SseChunk;
          yield chunk;
        } catch {
          // Ignore non-JSON SSE data
          console.warn("Skipping non-JSON SSE data:", data);
        }
      }
    }
  }
  
  if (buffer) {
    const line = buffer.trim();
    if (line.startsWith("data: ")) {
      const data = line.substring(6).trim();
      
      if (data === "[DONE]") {
        return;
      }
      
      try {
        const chunk = JSON.parse(data) as SseChunk;
        yield chunk;
      } catch {
        // Ignore non-JSON SSE data
        console.warn("Skipping non-JSON SSE data:", data);
      }
    }
  }
}