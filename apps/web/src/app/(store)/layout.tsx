import { CartDrawer } from '@/components/layout/CartDrawer';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { MenuDrawer } from '@/components/layout/MenuDrawer';
import { SearchPanel } from '@/components/layout/SearchPanel';
import { CursorFollower } from '@/components/motion/CursorFollower';
import { IntroLoader } from '@/components/motion/IntroLoader';
import { SmoothScroll } from '@/components/motion/SmoothScroll';

export default function StoreLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <IntroLoader />
      <SmoothScroll />
      <AnnouncementBar message="Winter sale 50% off use coupon code: WINTER50" />
      <Header />
      <main>{children}</main>
      <Footer />
      <MenuDrawer />
      <CartDrawer />
      <SearchPanel />
      <CursorFollower />
    </>
  );
}
