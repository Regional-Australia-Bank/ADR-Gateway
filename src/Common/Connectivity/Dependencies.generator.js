const yaml = require("js-yaml");
const fs = require("fs");
const Handlebars = require("handlebars")
const _ = require("lodash")

const dependenciesTemplate = Handlebars.compile(fs.readFileSync("src/Common/Connectivity/DependencyGraph.template.hbs","utf8"))
const connectorTemplate = Handlebars.compile(fs.readFileSync("src/Common/Connectivity/Connector.template.hbs","utf8"))

let dependencies = yaml.safeLoad(fs.readFileSync("src/Common/Connectivity/Dependencies.yml","utf8"));

// augment dependencies
dependencies = Object.fromEntries(Object.entries(dependencies).map(([k,p]) => {
  if (p.dependencies) {
    p.dependencyOutputs = Object.fromEntries(_.map(p.dependencies, dep => {
      if (typeof dep == 'string') {
        let dependencyName = dep;
        let depDependency = dependencies[dep];
        let outputType = depDependency.output || 'void'
        return [dependencyName,outputType]
      } else if (typeof dep == 'object') {
        let [[dependencyName,{when}]] = Object.entries(dep)
        let depDependency = dependencies[dependencyName];
        try {
          let outputType = depDependency.output || 'void'
          let outputName = dependencyName;
          if (when) {
            outputName += "?";
          }
          return [outputName,outputType]
        } catch {
          console.error(`Unable to find dependency ${dependencyName}`)
        }
      } else {
        throw 'This should not happen'
      }
    }))

    p.processedDependencies = _.map(p.dependencies, dep => {
      if (typeof dep == 'string') {
        return {simple:dep,dependency:dep}
      } else if (typeof dep == 'object') {
        let [[dependencyName,{when:condition,disableCache:disableCache}]] = Object.entries(dep)
        return {dependency:dependencyName,condition,disableCache}
      } else {
        throw 'This should not happen'
      }      
    })
  }
  if (p.preassertions) {
    p.processedPreassertions = _.map(p.preassertions, dep => {
      if (typeof dep == 'string') {
        return {simple:dep,dependency:dep}
      } else if (typeof dep == 'object') {
        let [[dependencyName,{when:condition,disableCache:disableCache}]] = Object.entries(dep)
        return {dependency:dependencyName,condition,disableCache}
      } else {
        throw 'This should not happen'
      }      
    })
  }

  return [k,p]
}))

// gather the cache trails
// this becomes a list of all the caches that are enabled on the dependency

for (let [k,spec] of Object.entries(dependencies)) {
  let cacheTrail = [];
  let disabledCaches = [];

  for (let p of _.concat(spec.processedPreassertions || [], spec.processedDependencies || [])) {
    if (p.disableCache) {
      disabledCaches.push(p.dependency)
    }
    cacheTrail = _.concat(cacheTrail,dependencies[p.dependency].cacheTrail)
  }

  // remove all duplicates, keeping only the first copies
  cacheTrail = _.uniq(cacheTrail);

  // remove disabled caches from the trail
  cacheTrail = _.filter(cacheTrail,x => _.indexOf(disabledCaches,x) < 0)
  cacheTrailSanitized = _.clone(cacheTrail)

  // add the current dependency if it is not "noCache"
  let noCache = spec.cache && spec.cache.noCache
  if (!noCache) {
    cacheTrail.push(k)
  }

  spec.disabledCaches = JSON.stringify(disabledCaches)
  spec.cacheTrail = cacheTrail
  spec.cacheTrailSanitized = cacheTrailSanitized
}


const dependenciesOutput = dependenciesTemplate({dependencies})

fs.writeFileSync("src/Common/Connectivity/DependencyGraph.generated.ts",dependenciesOutput)

const connectivityOutput = connectorTemplate({dependencies})

fs.writeFileSync("src/Common/Connectivity/Connector.generated.ts",connectivityOutput)


// var template = Handlebars.compile("Handlebars <b>{{doesWhat}}</b>");
// // execute the compiled template and print the output to the console
// console.log(template({ doesWhat: "rocks!" }));