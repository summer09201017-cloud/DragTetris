/**
 * 版號與更新紀錄住在 index.html 的 APP_VERSIONS（唯一來源,跟全艦隊其他站一致,不進 bundle）。
 * 這裡只是把它的兩個入口接出來給 React 用:標題列的版本鈕與設定面板都從這裡拿,
 * **不要在任何元件裡再手寫一份版號**。拿不到就退化,不能拋錯。
 */
export function appVersion(): string {
  const v = (window as unknown as { __appVersion?: string }).__appVersion;
  return v ?? '—';
}

export function openVersionSheet(): void {
  const fn = (window as unknown as { __openVersionSheet?: () => void }).__openVersionSheet;
  fn?.();
}
