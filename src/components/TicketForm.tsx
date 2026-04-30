import { useState } from "react";
import { Input, InputArea, Select, Button } from "@cloudflare/kumo";
import type { TicketPriority } from "../types";

interface TicketFormProps {
  onSubmit: (data: { title: string; description: string; priority: TicketPriority }) => void;
  onCancel: () => void;
}

export default function TicketForm({ onSubmit, onCancel }: TicketFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("medium");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({ title, description, priority });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
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
        items={{
          low: "低",
          medium: "中",
          high: "高",
          urgent: "緊急",
        }}
      />

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8 }}>
        <Button variant="secondary" onClick={onCancel}>取消</Button>
        <Button type="submit" variant="primary">建立</Button>
      </div>
    </form>
  );
}
