import React from "react";
import { Modal } from "../../components/Modal";

export type RetentionUnit = "month" | "week" | "day" | "hour" | "minute" | "off";

export interface RetentionModalProps {
  open: boolean;
  onClose: () => void;
  retentionUnit: RetentionUnit;
  setRetentionUnit: React.Dispatch<React.SetStateAction<RetentionUnit>>;
  retentionValue: number;
  setRetentionValue: React.Dispatch<React.SetStateAction<number>>;
  retentionSaving: boolean;
  onSave: () => void;
}

export function RetentionModal({
  open,
  onClose,
  retentionUnit,
  setRetentionUnit,
  retentionValue,
  setRetentionValue,
  retentionSaving,
  onSave
}: RetentionModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="自动删除时间">
      <div>
        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
          选择单位与数量，系统会换算为分钟并保存。
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(
            [
              ["off", "关闭"],
              ["minute", "分钟"],
              ["hour", "小时"],
              ["day", "天"],
              ["week", "一周"],
              ["month", "月"]
            ] as Array<[RetentionUnit, string]>
          ).map(([unit, label]) => (
            <button
              key={unit}
              type="button"
              onClick={() => {
                setRetentionUnit(unit);
                if (unit === "off") setRetentionValue(0);
                else setRetentionValue(v => (v > 0 ? v : 1));
              }}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.14)",
                background:
                  retentionUnit === unit ? "rgba(88,166,255,0.18)" : "transparent",
                color: "#e5e7eb",
                cursor: "pointer"
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 14 }}>
          {retentionUnit === "off" ? (
            <div style={{ fontSize: 12, opacity: 0.7 }}>当前为关闭（0 分钟）</div>
          ) : (
            <>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                数量（
                {retentionUnit === "minute"
                  ? "分钟"
                  : retentionUnit === "hour"
                    ? "小时"
                    : retentionUnit === "day"
                      ? "天"
                      : retentionUnit === "week"
                        ? "周"
                        : "月"}
                ）
              </div>
              <input
                type="number"
                value={retentionValue}
                onChange={e => setRetentionValue(Number(e.target.value))}
                min={1}
                style={{
                  width: "100%",
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "rgba(0,0,0,0.18)",
                  color: "#e5e7eb",
                  outline: "none"
                }}
              />
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
                换算：所选单位为分钟时直接保存；1 小时=60 分钟，1 天=1440 分钟，1
                周=10080 分钟，1 月按 30 天近似。
              </div>
            </>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "transparent",
              color: "#e5e7eb",
              cursor: "pointer"
            }}
            disabled={retentionSaving}
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={retentionSaving}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "none",
              background: "#58a6ff",
              color: "#08111c",
              fontWeight: 800,
              cursor: retentionSaving ? "not-allowed" : "pointer",
              opacity: retentionSaving ? 0.7 : 1
            }}
          >
            {retentionSaving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
