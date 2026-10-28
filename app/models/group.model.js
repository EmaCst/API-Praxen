"use strict";
module.exports=(sequelize,DataTypes)=>sequelize.define("group",{
 id:{type:DataTypes.INTEGER,autoIncrement:true,primaryKey:true},
 nombre:{type:DataTypes.STRING(120),allowNull:false},
 descripcion:{type:DataTypes.TEXT,allowNull:true},
 createdAt:{type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW,field:"created_at"}
},{tableName:"groups",timestamps:false});
