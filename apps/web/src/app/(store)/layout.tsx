import { CartDrawer } from '@/components/layout/CartDrawer';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { MenuDrawer } from '@/components/layout/MenuDrawer';
import { SearchPanel } from '@/components/layout/SearchPanel';
import { ShopSync } from '@/components/layout/ShopSync';
import { CursorFollower } from '@/components/motion/CursorFollower';
import { IntroLoader } from '@/components/motion/IntroLoader';
import { MotionProvider } from '@/components/motion/MotionProvider';
import { SmoothScroll } from '@/components/motion/SmoothScroll';
import { getBanners, getCategories, orFallback } from '@/lib/store-api';
import { navLinksFor } from '@/lib/site';

export default async function StoreLayout({ children }: LayoutProps<'/'>) {
  // The shell still renders if the API is briefly down; pages show their own error.
  const [categories, announcements] = await Promise.all([
    orFallback(getCategories, []),
    orFallback(() => getBanners('ANNOUNCEMENT'), []),
  ]);
  const navLinks = navLinksFor(categories);

  return (
    <MotionProvider>
      <IntroLoader />
      <SmoothScroll />
      <AnnouncementBar
        messages={announcements.flatMap((a) =>
          a.title ? [{ text: a.title, href: a.linkUrl }] : [],
        )}
      />
      <Header />
      <main>{children}</main>
      <Footer navLinks={navLinks} />
      <MenuDrawer navLinks={navLinks} />
      <ShopSync />
      <CartDrawer />
      <SearchPanel />
      <CursorFollower />
    </MotionProvider>
  );
}
