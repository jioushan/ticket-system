export interface User {
  id: string;
  username: string;
  email: string;
  role: "admin" | "user";
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  assignee: string;
  createdAt: string;
  updatedAt: string;
}

export type TicketStatus = Ticket["status"];
export type TicketPriority = Ticket["priority"];
