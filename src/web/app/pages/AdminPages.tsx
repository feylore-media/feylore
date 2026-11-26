import { NavLink, Outlet } from "react-router";
import { useTranslation } from "react-i18next";
import { Suspense } from "react";
import { filterAdminNavGroups } from "@shared/admin-sections";
import { useAuth } from "../auth-context";
import { AdminNavIcon } from "../../components/icons/AdminNavIcon";
import { LoadingState } from "../../components/states";
import styles from "./pages.module.css";

function useVisibleAdminNavGroups() {
  const { user } = useAuth();
  return filterAdminNavGroups(user?.permissions ?? []);
}

export function AdminLayout() {
  const { t } = useTranslation("admin");
  const groups = useVisibleAdminNavGroups();

  return (
    <div className={styles.adminShell}>
      <nav className={styles.adminSidebar} aria-label={t("title")}>
        <div className={styles.adminSidebarTitle}>{t("title")}</div>
        {groups.map((group) => (
          <div key={group.id} className={styles.adminNavGroup}>
            <div className={styles.adminNavGroupLabel}>{t(group.labelKey)}</div>
            {group.items.map((item) => (
              <NavLink
                key={item.id}
                to={item.path}
                end={item.path === "/admin"}
                className={({ isActive }) =>
                  isActive
                    ? `${styles.adminNavLink} ${styles.adminNavActive}`
                    : styles.adminNavLink
                }
              >
                <span className={styles.adminNavIcon} aria-hidden>
                  <AdminNavIcon name={item.icon} />
                </span>
                <span>{t(item.navKey)}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className={styles.adminContent}>
        <Suspense fallback={<LoadingState />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}

export function AdminDashboardPage() {
  const { t } = useTranslation("admin");
  return (
    <div>
      <h2 className={styles.adminPageTitle}>{t("dashboardTitle")}</h2>
      <p className={styles.adminPageDescription}>{t("dashboardDescription")}</p>
      <div className={styles.adminComingSoon}>
        <p className={styles.adminComingSoonLabel}>{t("comingSoon")}</p>
        <p className={styles.adminComingSoonDetail}>{t("comingSoonDetail")}</p>
      </div>
    </div>
  );
}

export function AdminStatusPage() {
  const { t } = useTranslation("admin");
  return (
    <div>
      <h2 className={styles.adminPageTitle}>{t("statusTitle")}</h2>
      <p className={styles.adminPageDescription}>{t("statusDescription")}</p>
      <div className={styles.adminComingSoon}>
        <p className={styles.adminComingSoonLabel}>{t("comingSoon")}</p>
        <p className={styles.adminComingSoonDetail}>{t("comingSoonDetail")}</p>
      </div>
    </div>
  );
}

export function AdminConversionPage() {
  const { t } = useTranslation("admin");
  return (
    <div>
      <h2 className={styles.adminPageTitle}>{t("conversionTitle")}</h2>
      <p className={styles.adminPageDescription}>
        {t("conversionDescription")}
      </p>
      <div className={styles.adminComingSoon}>
        <p className={styles.adminComingSoonLabel}>{t("comingSoon")}</p>
        <p className={styles.adminComingSoonDetail}>{t("comingSoonDetail")}</p>
      </div>
    </div>
  );
}

export function AdminDestinationPlaceholder({
  destinationKey,
}: {
  destinationKey: string;
}) {
  const { t } = useTranslation("admin");
  return (
    <div>
      <h2 className={styles.adminPageTitle}>{t(`${destinationKey}Title`)}</h2>
      <p className={styles.adminPageDescription}>
        {t(`${destinationKey}Description`)}
      </p>
      <div className={styles.adminComingSoon}>
        <p className={styles.adminComingSoonLabel}>{t("comingSoon")}</p>
        <p className={styles.adminComingSoonDetail}>{t("comingSoonDetail")}</p>
      </div>
    </div>
  );
}
