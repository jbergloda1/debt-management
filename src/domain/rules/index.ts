// Nạp các strategy mặc định vào registry (P8). Thêm strategy mới: gọi register* ở module riêng rồi import ở đây.
import './dueDate/strategies';
import './interest/models';

export * from './dueDate/registry';
export * from './interest/registry';
export * from './fees';
