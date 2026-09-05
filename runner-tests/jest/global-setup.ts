import { lifecycle } from './lifecycle';

export default (): Promise<void> => lifecycle.setup();
