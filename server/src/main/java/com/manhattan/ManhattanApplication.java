package com.manhattan;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.retry.annotation.EnableRetry;

@SpringBootApplication
@EnableRetry
public class ManhattanApplication {

    public static void main(String[] args) {
        SpringApplication.run(ManhattanApplication.class, args);
    }
}
