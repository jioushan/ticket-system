export interface User {
  id: string;
  username: string;
  email: string;
  role: "admin" | "user";
}

export interface Ticket {
  id: string;
  user_id: string;
  title: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  creator_name?: string;
  created_at: string;
  updated_at: string;
}

export interface TicketMessage {
  id: string;
  ticket_id: string;
  user_id: string;
  username: string;
  role: "admin" | "user";
  content: string;
  created_at: string;
}

export interface TicketDetail extends Ticket {
  messages: TicketMessage[];
}

export type TicketStatus = Ticket["status"];
export type TicketPriority = Ticket["priority"];
