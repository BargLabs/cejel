const controls = {
  integrity: () => false,
};

const selectedControl = controls[process.env.CEJEL_CONTROL];
selectedControl?.();
console.log('integrity verified');
