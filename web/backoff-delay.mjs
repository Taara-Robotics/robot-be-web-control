export class BackOffDelay {
    constructor() {
        this.min = 1000;
        this.max = 10000;
        this.step = 500;
        this.current = this.min;
    }

    get() {
        const returnValue = this.current;
        this.current = Math.min(this.current + this.step, this.max);

        console.log('delay', returnValue);

        return returnValue;
    }

    reset() {
        this.current = this.min;
    }
}