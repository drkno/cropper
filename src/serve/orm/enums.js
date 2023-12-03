import OrmService from './service.js';

const addValue = async(newValue, name) => {
    const result = await OrmService.run(`insert into ${name} (name) VALUES (:name) RETURNING id`, {
        ':name': newValue
    });
    return new EnumValue(result.id, newValue);
};

const toEnum = async(name) => {
    const values = await OrmService.all(`select * from ${name}`);
    const result = {};
    const enumValues = [];
    for (const value of values) {
        const newValue = new EnumValue(value.id, value.name);
        result[value.name] = newValue;
        enumValues.push(newValue);
    }
    result.values = () => enumValues;
    result.addValue = async(newValue) => {
        const newEnumValue = await addValue(newValue, name);
        result[newValue] = newEnumValue;
        enumValues.push(newEnumValue);
        return newEnumValue;
    };
    result.getOrAddValue = async(value) => {
        if (result[value]) {
            return result[value];
        }
        return await result.addValue(value);
    };
    return result;
};

class EnumValue {
    constructor(id, name) {
        this.id = id;
        this.name = name;
    }

    getId() {
        return this.id;
    }

    getName() {
        return this.name;
    }

    toString() {
        return this.id;
    }
}

export const State = await toEnum('State');
export const LocalSource = await toEnum('LocalSource');
export const RemoteSource = await toEnum('RemoteSource');
export const RemoteGroup = await toEnum('RemoteGroup');
