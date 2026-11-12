import { Link } from 'react-router';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/States';

export function NotFoundPage() {
  return (
    <EmptyState
      title="Không tìm thấy trang"
      description="Đường dẫn này chưa có trong bản 2.0."
      action={
        <Link to="/" className={buttonVariants({ variant: 'outline' })}>
          Về trang Tổng quan
        </Link>
      }
    />
  );
}
