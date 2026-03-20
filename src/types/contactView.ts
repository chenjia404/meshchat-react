/**
 * 由 `ContactRaw` 衍生、供列表與 Modal 共用的聯絡人列型別。
 */
export interface ContactViewRow {
  id: string;
  name: string;
  remark: string;
  remoteNickname: string;
  avatarUrl?: string;
  bio: string;
  chatKexPub: string;
  lastSeen: string;
  blocked: boolean;
}
