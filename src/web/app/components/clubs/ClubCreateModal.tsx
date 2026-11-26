import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ClubContext } from "@shared/clubs";
import { Button, TextField } from "../../../components/primitives";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/Dialog";
import { ClubContextSelect } from "./ClubContextBadge";
import styles from "./clubs.module.css";

const STEP_COUNT = 4;

export interface ClubCreateValues {
  name: string;
  description: string;
  visibility: "private" | "public";
  context: ClubContext;
}

interface ClubCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ClubCreateValues) => Promise<void>;
}

const INITIAL: ClubCreateValues = {
  name: "",
  description: "",
  visibility: "private",
  context: "general",
};

export function ClubCreateModal({
  open,
  onOpenChange,
  onSubmit,
}: ClubCreateModalProps) {
  const { t } = useTranslation("clubs");
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<ClubCreateValues>(INITIAL);
  const [saving, setSaving] = useState(false);

  function reset() {
    setStep(0);
    setValues(INITIAL);
    setSaving(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleCreate() {
    setSaving(true);
    try {
      await onSubmit(values);
      handleOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  const stepLabels = [
    t("wizardStepDetails"),
    t("wizardStepType"),
    t("wizardStepVisibility"),
    t("wizardStepCreate"),
  ];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent aria-label={t("createClub")}>
        <DialogHeader>
          <DialogTitle>{t("createClub")}</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <div className={styles.wizardSteps} aria-hidden>
            {stepLabels.map((label, index) => (
              <span
                key={label}
                className={index === step ? styles.wizardStepActive : undefined}
              >
                {index + 1}. {label}
              </span>
            ))}
          </div>

          {step === 0 && (
            <div className={styles.wizardField}>
              <TextField
                label={t("clubName")}
                id="clubCreateName"
                value={values.name}
                onChange={(e) =>
                  setValues((v) => ({ ...v, name: e.target.value }))
                }
                required
              />
              <TextField
                label={t("description")}
                id="clubCreateDescription"
                value={values.description}
                onChange={(e) =>
                  setValues((v) => ({ ...v, description: e.target.value }))
                }
              />
            </div>
          )}

          {step === 1 && (
            <div className={styles.wizardField}>
              <label className={styles.wizardLabel} htmlFor="clubCreateContext">
                {t("context")}
                <ClubContextSelect
                  id="clubCreateContext"
                  value={values.context}
                  onChange={(context) =>
                    setValues((v) => ({ ...v, context }))
                  }
                />
              </label>
            </div>
          )}

          {step === 2 && (
            <div className={styles.wizardField}>
              <label className={styles.wizardLabel} htmlFor="clubCreateVisibility">
                {t("visibility")}
                <select
                  id="clubCreateVisibility"
                  value={values.visibility}
                  onChange={(e) =>
                    setValues((v) => ({
                      ...v,
                      visibility: e.target.value as "private" | "public",
                    }))
                  }
                >
                  <option value="private">{t("visibilityPrivate")}</option>
                  <option value="public">{t("visibilityPublic")}</option>
                </select>
              </label>
            </div>
          )}

          {step === 3 && (
            <ul className={styles.summaryList}>
              <li className={styles.summaryItem}>
                <span className={styles.summaryLabel}>{t("clubName")}</span>
                {values.name}
              </li>
              {values.description && (
                <li className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>{t("description")}</span>
                  {values.description}
                </li>
              )}
              <li className={styles.summaryItem}>
                <span className={styles.summaryLabel}>{t("context")}</span>
                {t(
                  values.context === "general"
                    ? "contextGeneral"
                    : values.context === "book"
                      ? "contextBook"
                      : values.context === "video"
                        ? "contextVideo"
                        : "contextTtrpg",
                )}
              </li>
              <li className={styles.summaryItem}>
                <span className={styles.summaryLabel}>{t("visibility")}</span>
                {values.visibility === "private"
                  ? t("visibilityPrivate")
                  : t("visibilityPublic")}
              </li>
            </ul>
          )}
        </DialogBody>

        <DialogFooter>
          {step > 0 && (
            <Button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              disabled={saving}
            >
              {t("wizardBack")}
            </Button>
          )}
          <Button
            type="button"
            onClick={() => handleOpenChange(false)}
            disabled={saving}
          >
            {t("cancel")}
          </Button>
          {step < STEP_COUNT - 1 ? (
            <Button
              type="button"
              variant="primary"
              disabled={step === 0 && !values.name.trim()}
              onClick={() => setStep((s) => s + 1)}
            >
              {t("wizardNext")}
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              disabled={saving || !values.name.trim()}
              onClick={() => void handleCreate()}
            >
              {t("create")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
