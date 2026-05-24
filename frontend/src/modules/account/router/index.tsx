import { lazyPage } from "@/app/lazyPage";
import type { FrontendModule } from "@/app/types";

/** Account self-service — settings page user vào để đổi profile/password.
 *  Không có nav entry vì route được mở qua cog icon ở TopBar (CVP) hoặc
 *  user menu (admin shell). Path /account dùng chung cho mọi role. */
export const moduleManifest: FrontendModule = {
  name: "account",
  label: "Account",
  routes: [
    {
      path: "account",
      element: lazyPage(() => import("../AccountPage"), "AccountPage"),
    },
  ],
  nav: [],
};
