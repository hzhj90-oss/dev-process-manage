package com.devprocess.manager;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@MapperScan({
        "com.devprocess.manager.project.mapper",
        "com.devprocess.manager.version.mapper",
        "com.devprocess.manager.requirement.mapper",
        "com.devprocess.manager.testcase.mapper",
        "com.devprocess.manager.testscript.mapper",
        "com.devprocess.manager.environment.mapper",
        "com.devprocess.manager.testcycle.mapper",
        "com.devprocess.manager.execution.mapper"
})
public class DevProcessManagerApplication {

    public static void main(String[] args) {
        SpringApplication.run(DevProcessManagerApplication.class, args);
    }
}