import React from "react";
import type { MeshchatMessage, ThreadKind } from "../../types";
import { buildMeshchatIpfsUrl, peekMeshchatMessagePreview } from "../../utils/meshchatApi";
import { textAvatarLetter } from "../../components/FallbackAvatar";
import { formatTime, formatFileSize, isAudioMime, isImageMime, isVideoMime } from "../../utils";

function normalizeMessageMultilineText(text: string | undefined): string {
  const normalized = (text ?? "").replace(/\r\n/g, "\n");
  if (normalized.includes("\n")) return normalized;
  return normalized.replace(/\\n/g, "\n");
}


type LP = (
  kind: ThreadKind,
  threadId: string,
  msgId: string,
  opts: {
    canRevoke: boolean;
    forwardText: string;
    forwardFile?: { url: string; fileName: string; mimeType: string };
  }
) => Record<string, unknown>;

export function MeshchatSuperGroupMessages(props: {
  messages: MeshchatMessage[];
  myUserId?: number;
  selectedThreadId: string;
  createLongPressHandlers: LP;
  setImagePreview: (v: { src: string; alt: string } | null) => void;
}) {
  const { messages, myUserId, selectedThreadId, createLongPressHandlers, setImagePreview } = props;
  const sorted = [...messages].sort((a, b) => {
    const sa = typeof a.seq === "number" ? a.seq : 0;
    const sb = typeof b.seq === "number" ? b.seq : 0;
    if (sa !== sb) return sa - sb;
    return (Date.parse(a.created_at || "") || 0) - (Date.parse(b.created_at || "") || 0);
  });
  return (
    <>
      {sorted.map((m, idx) => {
        const mid = (m.message_id || "").trim() || `idx-${idx}`;
        const senderId = m.sender?.id;
        const fromMe = myUserId !== undefined && senderId !== undefined && senderId === myUserId;
        const senderLabel = fromMe ? "我" : (m.sender?.display_name || m.sender?.username || "成员").trim() || "成员";
        const letter = textAvatarLetter(senderLabel);
        const ct = (m.content_type || "").toLowerCase();
        const p = m.payload || {};
        const deleted = (m.status || "").toLowerCase() === "deleted";
        const textRaw = ct === "text" && typeof p.text === "string" ? normalizeMessageMultilineText(p.text) : "";
        const textTrimmed = textRaw.trim();
        const cid = typeof p.cid === "string" ? p.cid.trim() : "";
        const mime = typeof p.mime_type === "string" ? p.mime_type : "";
        const fileName = typeof p.file_name === "string" ? p.file_name : ct === "image" ? "image.jpg" : "file";
        const caption = typeof p.caption === "string" ? normalizeMessageMultilineText(p.caption) : "";
        const mediaUrl = cid && (ct === "image" || ct === "video" || ct === "file" || ct === "voice") ? buildMeshchatIpfsUrl(cid, fileName) : "";
        const showImage = ct === "image" && !!mediaUrl;
        const showVideo = ct === "video" && !!mediaUrl;
        const showFile = (ct === "file" || ct === "voice") && !!mediaUrl;
        const forwardText = deleted
          ? ""
          : showImage || showVideo
            ? textTrimmed
              ? `${textRaw}\n[媒体]\n${mediaUrl}`
              : `[媒体]\n${mediaUrl}`
            : showFile
              ? textTrimmed
                ? `${textRaw}\n[文件] ${fileName}\n${mediaUrl}`
                : `[文件] ${fileName}\n${mediaUrl}`
              : textRaw;
        const forwardFile = showImage && mediaUrl ? { url: mediaUrl, fileName: /\.(png|jpe?g|gif|webp)$/i.test(fileName) ? fileName : "img-" + mid + ".jpg", mimeType: isImageMime(mime) ? mime : "image/jpeg" } : showFile && mediaUrl ? { url: mediaUrl, fileName: fileName || "file", mimeType: mime || "application/octet-stream" } : undefined;
        return (
          <div key={mid} data-msg-idx={idx} style={{ display: "flex", justifyContent: fromMe ? "flex-end" : "flex-start", gap: 8, marginBottom: 10 }}>
            {!fromMe && (
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#1f2933", color: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>{letter}</div>
            )}
            <div style={{ maxWidth: "78%" }}>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4, textAlign: fromMe ? "right" : "left" }}>{senderLabel} · {formatTime(m.created_at)}</div>
              <div style={{ padding: "10px 12px", borderRadius: 12, background: fromMe ? "rgba(88,166,255,0.16)" : "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word" }} {...createLongPressHandlers("meshchat_super_group", selectedThreadId || "", mid, { canRevoke: fromMe && !deleted, forwardText, forwardFile })}>
                {deleted ? (
                  <span style={{ opacity: 0.65 }}>该消息已删除</span>
                ) : showImage ? (
                  <div><img src={mediaUrl} alt={caption || "image"} role="button" tabIndex={0} onClick={e => { e.stopPropagation(); setImagePreview({ src: mediaUrl, alt: caption || "image" }); }} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setImagePreview({ src: mediaUrl, alt: caption || "image" }); } }} style={{ maxWidth: "100%", borderRadius: 10, display: "block", cursor: "zoom-in" }} />{caption ? <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>{caption}</div> : null}</div>
                ) : showVideo ? (
                  <div><video src={mediaUrl} controls style={{ maxWidth: "100%", borderRadius: 10 }} />{caption ? <div style={{ marginTop: 6, fontSize: 12 }}>{caption}</div> : null}</div>
                ) : showFile ? (
                  <div>{isImageMime(mime) ? <img src={mediaUrl} alt={fileName} style={{ maxWidth: "100%", borderRadius: 10, cursor: "zoom-in" }} onClick={e => { e.stopPropagation(); setImagePreview({ src: mediaUrl, alt: fileName }); }} /> : isVideoMime(mime) ? <video src={mediaUrl} controls style={{ maxWidth: "100%", borderRadius: 10 }} /> : isAudioMime(mime) ? <audio src={mediaUrl} controls style={{ width: "100%", maxWidth: 420 }} /> : <div style={{ fontSize: 13 }}><div style={{ fontWeight: 700 }}>{fileName}</div><div style={{ opacity: 0.75, fontSize: 12 }}>{mime} · {formatFileSize(typeof p.size === "number" ? p.size : undefined)}</div><a href={mediaUrl} download={fileName} style={{ color: "#93c5fd" }}>下载文件</a></div>}{caption ? <div style={{ marginTop: 8, fontSize: 14 }}>{caption}</div> : null}</div>
                ) : textTrimmed ? (
                  textRaw
                ) : (
                  <span style={{ opacity: 0.75 }}>{peekMeshchatMessagePreview(m)}</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
