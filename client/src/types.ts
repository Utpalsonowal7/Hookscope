export type Endpoint={id:string;slug:string;name:string;response_status:number;request_count:number;last_received_at:string|null};
export type Capture={id:string;endpoint_id:string;method:string;path:string;body_bytes:number;response_status:number;received_at:string};
export type Replay={id:string;target:string;status:number|null;duration_ms:number;response_body:string;error:string|null;created_at:string};
export type Detail=Capture & {headers:Record<string,unknown>;query:Record<string,unknown>;body:string;body_base64:string;replays:Replay[]};
export type Session={authenticated:boolean;publicBase:string;replayOrigins:string[];retentionDays:number;maxRequests:number};
