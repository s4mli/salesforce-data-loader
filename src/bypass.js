
exports.handler = async (event) => {
    return 0 === event.group ? event : null;
};
