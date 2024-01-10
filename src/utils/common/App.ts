import { inherits } from "util";

class App {
  constructor() {}

  protected async init() {
    // intialize all the connections here;
    // maintain the sequence on priority
  }

  protected async start() {
    // @Todo: add error handlers.
    await this.init();
  }
}

export default App;
