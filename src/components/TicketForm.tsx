import { useState } from "react";
import { Input, InputArea, Select, Button } from "@cloudflare/kumo";
import type { Ticket, TicketPriority } from "../types";

interface TicketFormProps {
  ticket?: Ticket;
  onSubmit: (data: { title: string; description: string; priority: TicketPriority; assignee: string }) => void;
  onCancel: () => void;
}

export default function TicketForm({ ticket, onSubmit, onCancel }: TicketFormProps) {
  const [title, setTitle] = useState(ticket?.title ?? "");
  const [description, setDescription] = useState(ticket?.description ?? "");
  const [priority, setPriority] = useState<TicketPriority>(ticket?.priority ?? "medium");
  const [assignee, setAssignee] = useState(ticket?.assignee ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({ title, description, priority, assignee });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label="工單標題"
        placeholder="請輸入工單標題"
        value={title}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
        required
      />

      <InputArea
        label="工單描述"
        placeholder="請輸入工單描述"
        value={description}
        onValueChange={setDescription}
        rows={4}
      />

      <Select
        label="優先級"
        value={priority}
        onValueChange={(v) => { if (v) setPriority(v as TicketPriority); }}
      >
        <Select.Option value="low">低</Select.Option>
        <Select.Option value="medium">中</Select.Option>
        <Select.Option value="high">高</Select.Option>
        <Select.Option value="urgent">緊急</Select.Option>
      </Select>

      <Input
        label="指派給"
        placeholder="請輸入負責人"
        value={assignee}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAssignee(e.target.value)}
      />

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel}>取消</Button>
        <Button type="submit" variant="primary">{ticket ? "更新" : "建立"}</Button>
      </div>
    </form>
  );
}
