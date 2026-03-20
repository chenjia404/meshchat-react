export interface GroupRaw {
  group_id: string;
  title?: string;
  member_count?: number;
  updated_at?: string;
  last_message_at?: string;
  last_message?: { plaintext?: string };
  retention_minutes?: number;
}
